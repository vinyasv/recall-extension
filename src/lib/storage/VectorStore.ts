/**
 * Vector Store - IndexedDB wrapper for storing page embeddings
 */

import type {
  PageRecord,
  PageMetadata,
  PageRecordUpdate,
  DatabaseStats,
  DatabaseConfig,
  SerializedPageRecord,
  SerializedPageMetadata,
} from './types';
import { generateUUID } from '../../utils/uuid';
import { loggers } from '../utils/logger';
import { PERFORMANCE_CONFIG } from '../config/searchConfig';

const DEFAULT_CONFIG: DatabaseConfig = {
  name: 'MemexVectorDB',
  version: 3, // Increment version for metadata support
  storeName: 'pages',
};

/**
 * VectorStore class for managing page embeddings in IndexedDB
 */
export class VectorStore {
  private db: IDBDatabase | null = null;
  private config: DatabaseConfig;
  private initPromise: Promise<void> | null = null;
  private statsCache: DatabaseStats | null = null;
  private statsCacheTimestamp: number = 0;

  constructor(config: Partial<DatabaseConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Initialize the database
   * Creates the object store and indexes if needed
   */
  async initialize(): Promise<void> {
    if (this.db) {
      return; // Already initialized
    }

    if (this.initPromise) {
      return this.initPromise; // Initialization in progress
    }

    this.initPromise = this._initialize();
    return this.initPromise;
  }

  private async _initialize(): Promise<void> {
    return new Promise((resolve, reject) => {
      console.log('[VectorStore] Opening database:', this.config.name);

      const request = indexedDB.open(this.config.name, this.config.version);

      request.onerror = () => {
        console.error('[VectorStore] Database open error:', request.error);
        this.initPromise = null;
        reject(new Error(`Failed to open database: ${request.error}`));
      };

      request.onsuccess = () => {
        this.db = request.result;
        console.log('[VectorStore] Database opened successfully');
        resolve();
      };

      request.onupgradeneeded = (event) => {
        console.log('[VectorStore] Database upgrade needed');
        const db = (event.target as IDBOpenDBRequest).result;
        const transaction = (event.target as IDBOpenDBRequest).transaction;
        const oldVersion = event.oldVersion;

        // Create object store if it doesn't exist
        if (!db.objectStoreNames.contains(this.config.storeName)) {
          const objectStore = db.createObjectStore(this.config.storeName, {
            keyPath: 'id',
          });

          // Create indexes for efficient querying
          objectStore.createIndex('url', 'url', { unique: false });
          objectStore.createIndex('timestamp', 'timestamp', { unique: false });
          objectStore.createIndex('dwellTime', 'dwellTime', { unique: false });
          objectStore.createIndex('lastAccessed', 'lastAccessed', { unique: false });

          console.log('[VectorStore] Object store and indexes created');
        } else if (oldVersion < 2) {
          // Upgrade to version 2: add passage support
          console.log('[VectorStore] Upgrading to version 2 (passage support)');

          // Clear existing data since we're changing the schema significantly
          if (transaction) {
            const objectStore = transaction.objectStore(this.config.storeName);
            const clearRequest = objectStore.clear();

            clearRequest.onsuccess = () => {
              console.log('[VectorStore] Cleared old data for passage migration');
            };

            clearRequest.onerror = () => {
              console.error('[VectorStore] Failed to clear old data:', clearRequest.error);
            };
          }
        }
      };
    });
  }

  /**
   * Add a new page to the database
   * @param record Page record to add
   * @returns The ID of the added page
   */
  async addPage(record: Omit<PageRecord, 'id'>): Promise<string> {
    await this.initialize();

    const id = generateUUID();
    const fullRecord: PageRecord = { id, ...record };

    // Serialize the record for storage
    const serialized = this._serializeRecord(fullRecord);

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.config.storeName], 'readwrite');
      const store = transaction.objectStore(this.config.storeName);
      const request = store.add(serialized);

      request.onsuccess = () => {
        this.invalidateStatsCache();
        loggers.vectorStore.debug('Page added:', id);
        resolve(id);
      };

      request.onerror = () => {
        console.error('[VectorStore] Failed to add page:', request.error);
        reject(new Error(`Failed to add page: ${request.error}`));
      };
    });
  }

  /**
   * Get a page by ID
   * @param id Page ID
   * @returns Page record or null if not found
   */
  async getPage(id: string): Promise<PageRecord | null> {
    await this.initialize();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.config.storeName], 'readonly');
      const store = transaction.objectStore(this.config.storeName);
      const request = store.get(id);

      request.onsuccess = () => {
        if (request.result) {
          const deserialized = this._deserializeRecord(request.result);
          resolve(deserialized);
        } else {
          resolve(null);
        }
      };

      request.onerror = () => {
        console.error('[VectorStore] Failed to get page:', request.error);
        reject(new Error(`Failed to get page: ${request.error}`));
      };
    });
  }

  /**
   * Get a page by URL
   * @param url Page URL
   * @returns Page record or null if not found
   */
  async getPageByUrl(url: string): Promise<PageRecord | null> {
    await this.initialize();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.config.storeName], 'readonly');
      const store = transaction.objectStore(this.config.storeName);
      const index = store.index('url');
      const request = index.get(url);

      request.onsuccess = () => {
        if (request.result) {
          const deserialized = this._deserializeRecord(request.result);
          resolve(deserialized);
        } else {
          resolve(null);
        }
      };

      request.onerror = () => {
        console.error('[VectorStore] Failed to get page by URL:', request.error);
        reject(new Error(`Failed to get page by URL: ${request.error}`));
      };
    });
  }

  /**
   * Get all page metadata (excluding content and passages) for fast search
   * @returns Array of page metadata records
   */
  async getAllPageMetadata(): Promise<PageMetadata[]> {
    await this.initialize();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.config.storeName], 'readonly');
      const store = transaction.objectStore(this.config.storeName);
      const request = store.getAll();

      request.onsuccess = () => {
        const metadata = request.result.map((serialized) =>
          this._deserializeMetadata(serialized)
        );
        resolve(metadata);
      };

      request.onerror = () => {
        console.error('[VectorStore] Failed to get all page metadata:', request.error);
        reject(new Error(`Failed to get all page metadata: ${request.error}`));
      };
    });
  }

  /**
   * Get all pages from the database
   * @returns Array of all page records
   */
  async getAllPages(): Promise<PageRecord[]> {
    await this.initialize();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.config.storeName], 'readonly');
      const store = transaction.objectStore(this.config.storeName);
      const request = store.getAll();

      request.onsuccess = () => {
        const pages = request.result.map((serialized) =>
          this._deserializeRecord(serialized)
        );
        resolve(pages);
      };

      request.onerror = () => {
        console.error('[VectorStore] Failed to get all pages:', request.error);
        reject(new Error(`Failed to get all pages: ${request.error}`));
      };
    });
  }

  /**
   * Update a page
   * @param id Page ID
   * @param updates Partial page record with fields to update
   */
  async updatePage(id: string, updates: PageRecordUpdate): Promise<void> {
    await this.initialize();

    // Get the existing record first
    const existing = await this.getPage(id);
    if (!existing) {
      throw new Error(`Page not found: ${id}`);
    }

    // Merge updates
    const updated: PageRecord = { ...existing, ...updates };

    // Serialize and save
    const serialized = this._serializeRecord(updated);

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.config.storeName], 'readwrite');
      const store = transaction.objectStore(this.config.storeName);
      const request = store.put(serialized);

      request.onsuccess = () => {
        this.invalidateStatsCache();
        loggers.vectorStore.debug('Page updated:', id);
        resolve();
      };

      request.onerror = () => {
        console.error('[VectorStore] Failed to update page:', request.error);
        reject(new Error(`Failed to update page: ${request.error}`));
      };
    });
  }

  /**
   * Delete a page
   * @param id Page ID
   */
  async deletePage(id: string): Promise<void> {
    await this.initialize();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.config.storeName], 'readwrite');
      const store = transaction.objectStore(this.config.storeName);
      const request = store.delete(id);

      request.onsuccess = () => {
        this.invalidateStatsCache();
        loggers.vectorStore.debug('Page deleted:', id);
        resolve();
      };

      request.onerror = () => {
        console.error('[VectorStore] Failed to delete page:', request.error);
        reject(new Error(`Failed to delete page: ${request.error}`));
      };
    });
  }

  /**
   * Get database statistics
   * @returns Database stats
   */
  async getStats(): Promise<DatabaseStats> {
    return loggers.vectorStore.timedAsync('get-stats', async () => {
      await this.initialize();

      // Check cache first
      const now = Date.now();
      if (
        this.statsCache &&
        (now - this.statsCacheTimestamp) < PERFORMANCE_CONFIG.STATS_CACHE_TTL
      ) {
        loggers.vectorStore.debug('Returning cached stats');
        return this.statsCache;
      }

      loggers.vectorStore.debug('Computing fresh stats');

      // Use metadata only for faster calculation
      const metadata = await this.getAllPageMetadata();

      const stats: DatabaseStats = {
        totalPages: metadata.length,
        sizeBytes: 0, // Approximate calculation
        oldestTimestamp: metadata.length > 0 ? Math.min(...metadata.map((p) => p.timestamp)) : 0,
        newestTimestamp: metadata.length > 0 ? Math.max(...metadata.map((p) => p.timestamp)) : 0,
        lastAccessedTimestamp:
          metadata.length > 0 ? Math.max(...metadata.map((p) => p.lastAccessed)) : 0,
      };

      // Approximate size calculation (metadata only estimation)
      // This is much faster than loading full pages
      metadata.forEach((meta) => {
        // Estimate content size based on title length (rough approximation)
        stats.sizeBytes += meta.title.length * 2; // chars are 2 bytes
        stats.sizeBytes += meta.embedding.length * 4; // Float32 is 4 bytes
        stats.sizeBytes += 300; // Estimated overhead for content and passages
      });

      // Cache the result
      this.statsCache = stats;
      this.statsCacheTimestamp = now;

      return stats;
    });
  }

  /**
   * Invalidate stats cache (call when data changes)
   */
  private invalidateStatsCache(): void {
    this.statsCache = null;
    this.statsCacheTimestamp = 0;
    loggers.vectorStore.debug('Stats cache invalidated');
  }

  /**
   * Clear all data from the database (for testing)
   */
  async clearDatabase(): Promise<void> {
    await this.initialize();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.config.storeName], 'readwrite');
      const store = transaction.objectStore(this.config.storeName);
      const request = store.clear();

      request.onsuccess = () => {
        this.invalidateStatsCache();
        loggers.vectorStore.debug('Database cleared');
        resolve();
      };

      request.onerror = () => {
        console.error('[VectorStore] Failed to clear database:', request.error);
        reject(new Error(`Failed to clear database: ${request.error}`));
      };
    });
  }

  /**
   * Clear all data from the database (alias for clearDatabase)
   */
  async clearAll(): Promise<void> {
    return this.clearDatabase();
  }

  /**
   * Serialize a page record for storage
   * Converts Float32Array to ArrayBuffer and handles passages
   */
  private _serializeRecord(record: PageRecord): SerializedPageRecord {
    // Serialize passages (convert Float32Array embeddings to ArrayBuffer)
    const serializedPassages = record.passages.map(passage => ({
      ...passage,
      embedding: passage.embedding ? passage.embedding.buffer.slice(
        passage.embedding.byteOffset,
        passage.embedding.byteOffset + passage.embedding.byteLength
      ) as ArrayBuffer : undefined,
    }));

    return {
      ...record,
      passages: serializedPassages,
      embedding: record.embedding.buffer.slice(
        record.embedding.byteOffset,
        record.embedding.byteOffset + record.embedding.byteLength
      ) as ArrayBuffer,
    };
  }

  /**
   * Deserialize page metadata from storage
   * Converts ArrayBuffer back to Float32Array (excludes content and passages)
   */
  private _deserializeMetadata(serialized: SerializedPageRecord | SerializedPageMetadata): PageMetadata {
    return {
      id: serialized.id,
      url: serialized.url,
      title: serialized.title,
      embedding: new Float32Array(serialized.embedding),
      timestamp: serialized.timestamp,
      dwellTime: serialized.dwellTime,
      lastAccessed: serialized.lastAccessed,
    };
  }

  /**
   * Deserialize a page record from storage
   * Converts ArrayBuffer back to Float32Array and handles passages
   */
  private _deserializeRecord(serialized: SerializedPageRecord): PageRecord {
    // Deserialize passages (convert ArrayBuffer embeddings back to Float32Array)
    const passages = serialized.passages.map(passage => ({
      ...passage,
      embedding: passage.embedding ? new Float32Array(passage.embedding) : undefined,
    }));

    return {
      ...serialized,
      passages,
      embedding: new Float32Array(serialized.embedding),
    };
  }

  /**
   * Close the database connection
   */
  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
      this.initPromise = null;
      console.log('[VectorStore] Database closed');
    }
  }
}

// Export singleton instance
export const vectorStore = new VectorStore();
