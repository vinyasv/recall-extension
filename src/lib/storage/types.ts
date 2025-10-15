/**
 * Type definitions for the vector storage layer
 */

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

  /** AI-generated summary */
  summary: string;

  /** 384-dimensional embedding vector from all-MiniLM-L6-v2 */
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
 * Serialized page record for IndexedDB storage
 * (Float32Array needs to be stored as ArrayBuffer)
 */
export interface SerializedPageRecord {
  id: string;
  url: string;
  title: string;
  content: string;
  summary: string;
  embedding: ArrayBuffer;
  timestamp: number;
  dwellTime: number;
  lastAccessed: number;
}
