/**
 * Type definitions for the vector storage layer
 */

/**
 * Represents a semantic passage from a document
 */
export interface Passage {
  /** Unique identifier within the page */
  id: string;

  /** Passage text content */
  text: string;

  /** Number of words in the passage */
  wordCount: number;

  /** Position within the document (0-based) */
  position: number;

  /** Quality score (0-1, higher is better) */
  quality: number;

  /** 384-dimensional embedding vector */
  embedding?: Float32Array;

  /** DOM element information (optional) */
  element?: {
    tagName: string;
    className?: string;
    id?: string;
  };
}

/**
 * Lightweight page metadata for fast search operations
 */
export interface PageMetadata {
  /** Unique identifier (UUID v4) */
  id: string;

  /** Page URL */
  url: string;

  /** Page title */
  title: string;

  /** Page-level embedding (title + concatenated passages) */
  embedding: Float32Array;

  /** Visit timestamp (ms since epoch) */
  timestamp: number;

  /** Time spent on page in seconds */
  dwellTime: number;

  /** Last time this page was accessed from search results (ms since epoch) */
  lastAccessed: number;
}

/**
 * Represents a page record in the database
 */
export interface PageRecord {
  /** Unique identifier (UUID v4) */
  id: string;

  /** Page URL */
  url: string;

  /** Page title */
  title: string;

  /** Raw extracted text content */
  content: string;

  /** AI-generated search-optimized summary */
  summary: string;

  /** Array of semantic passages from the page */
  passages: Passage[];

  /** Page-level embedding (title + summary + concatenated passages) */
  embedding: Float32Array;

  /** Visit timestamp (ms since epoch) */
  timestamp: number;

  /** Time spent on page in seconds */
  dwellTime: number;

  /** Last time this page was accessed from search results (ms since epoch) */
  lastAccessed: number;
}

/**
 * Partial page record for updates
 */
export type PageRecordUpdate = Partial<Omit<PageRecord, 'id'>>;

/**
 * Database statistics
 */
export interface DatabaseStats {
  /** Total number of pages indexed */
  totalPages: number;

  /** Approximate database size in bytes */
  sizeBytes: number;

  /** Timestamp of oldest page */
  oldestTimestamp: number;

  /** Timestamp of newest page */
  newestTimestamp: number;

  /** Most recently accessed page timestamp */
  lastAccessedTimestamp: number;
}

/**
 * Database configuration
 */
export interface DatabaseConfig {
  /** Database name */
  name: string;

  /** Database version */
  version: number;

  /** Object store name */
  storeName: string;
}

/**
 * Serialized passage for IndexedDB storage
 */
export interface SerializedPassage {
  id: string;
  text: string;
  wordCount: number;
  position: number;
  quality: number;
  embedding?: ArrayBuffer;
  element?: {
    tagName: string;
    className?: string;
    id?: string;
  };
}

/**
 * Serialized page metadata for IndexedDB storage
 * (Float32Array needs to be stored as ArrayBuffer)
 */
export interface SerializedPageMetadata {
  id: string;
  url: string;
  title: string;
  embedding: ArrayBuffer;
  timestamp: number;
  dwellTime: number;
  lastAccessed: number;
}

/**
 * Serialized page record for IndexedDB storage
 * (Float32Array needs to be stored as ArrayBuffer)
 */
export interface SerializedPageRecord {
  id: string;
  url: string;
  title: string;
  content: string;
  summary: string;
  passages: SerializedPassage[];
  embedding: ArrayBuffer;
  timestamp: number;
  dwellTime: number;
  lastAccessed: number;
}
