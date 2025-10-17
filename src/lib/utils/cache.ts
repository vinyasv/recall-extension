/**
 * Simple caching utilities for performance optimization
 */

import { PERFORMANCE_CONFIG } from '../config/searchConfig';

/**
 * Cache entry with TTL support
 */
interface CacheEntry<T> {
  value: T;
  timestamp: number;
  ttl: number;
}

/**
 * Simple LRU cache with TTL support
 */
export class LRUCache<T> {
  private cache = new Map<string, CacheEntry<T>>();
  private maxSize: number;

  constructor(maxSize: number = PERFORMANCE_CONFIG.QUERY_CACHE_SIZE) {
    this.maxSize = maxSize;
  }

  /**
   * Get value from cache
   */
  get(key: string): T | undefined {
    const entry = this.cache.get(key);

    if (!entry) {
      return undefined;
    }

    // Check TTL
    if (Date.now() - entry.timestamp > entry.ttl) {
      this.cache.delete(key);
      return undefined;
    }

    // Move to end (LRU)
    this.cache.delete(key);
    this.cache.set(key, entry);

    return entry.value;
  }

  /**
   * Set value in cache
   */
  set(key: string, value: T, ttl: number = PERFORMANCE_CONFIG.QUERY_CACHE_TTL): void {
    // Remove existing entry
    if (this.cache.has(key)) {
      this.cache.delete(key);
    }

    // Remove oldest if at capacity
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) {
        this.cache.delete(firstKey);
      }
    }

    // Add new entry
    this.cache.set(key, {
      value,
      timestamp: Date.now(),
      ttl,
    });
  }

  /**
   * Clear cache
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Get cache size
   */
  get size(): number {
    return this.cache.size;
  }

  /**
   * Check if key exists and is not expired
   */
  has(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) {
      return false;
    }

    // Check TTL
    if (Date.now() - entry.timestamp > entry.ttl) {
      this.cache.delete(key);
      return false;
    }

    return true;
  }

  /**
   * Delete specific key
   */
  delete(key: string): boolean {
    return this.cache.delete(key);
  }

  /**
   * Clean up expired entries
   */
  cleanup(): number {
    let removed = 0;
    const now = Date.now();

    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > entry.ttl) {
        this.cache.delete(key);
        removed++;
      }
    }

    return removed;
  }
}

/**
 * Create a memoized function with simple caching
 */
export function memoize<T extends (...args: any[]) => any>(
  fn: T,
  getKey?: (...args: Parameters<T>) => string,
  ttl: number = PERFORMANCE_CONFIG.QUERY_CACHE_TTL
): T {
  const cache = new LRUCache<ReturnType<T>>(PERFORMANCE_CONFIG.QUERY_CACHE_SIZE);

  return ((...args: Parameters<T>) => {
    const key = getKey ? getKey(...args) : JSON.stringify(args);

    const cached = cache.get(key);
    if (cached !== undefined) {
      return cached;
    }

    const result = fn(...args);
    cache.set(key, result, ttl);
    return result;
  }) as T;
}

/**
 * Global cache instances
 */
export const globalCaches = {
  queryCache: new LRUCache<any>(PERFORMANCE_CONFIG.QUERY_CACHE_SIZE),
  metadataCache: new LRUCache<any>(PERFORMANCE_CONFIG.METADATA_CACHE_SIZE),
  statsCache: new LRUCache<any>(50), // Small cache for stats
  embeddingCache: new LRUCache<Float32Array>(200), // Cache for embeddings
} as const;

/**
 * Cache key generators
 */
export const cacheKeys = {
  searchQuery: (query: string, options: any) => `search:${query}:${JSON.stringify(options)}`,
  vectorSearch: (embeddingHash: string, options: any) => `vector:${embeddingHash}:${JSON.stringify(options)}`,
  keywordSearch: (query: string, options: any) => `keyword:${query}:${JSON.stringify(options)}`,
  pageMetadata: (pageId: string) => `metadata:${pageId}`,
  dbStats: () => 'stats:db',
  embedding: (text: string) => `embedding:${text.slice(0, 100)}`, // First 100 chars as key
} as const;

/**
 * Utility to hash embeddings for cache keys
 */
export function hashEmbedding(embedding: Float32Array): string {
  // Simple hash - take first few values and combine
  const hashValues = [];
  for (let i = 0; i < Math.min(8, embedding.length); i++) {
    hashValues.push(Math.round(embedding[i] * 1000));
  }
  return hashValues.join('_');
}