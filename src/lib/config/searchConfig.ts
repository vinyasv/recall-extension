/**
 * Centralized search configuration
 */

import type { SearchOptions, RankingConfig } from '../search/types';

/**
 * Default search options
 * Note: minSimilarity = 0.70 validated as optimal for passage-only embeddings (100% precision)
 */
export const DEFAULT_SEARCH_OPTIONS: Required<Omit<SearchOptions, 'mode' | 'alpha'>> = {
  k: 10,
  minSimilarity: 0.70, // Validated optimal for passage-only approach
  boostRecent: true,
  boostFrequent: true,
  recencyWeight: 0.15,
  frequencyWeight: 0.15,
};

/**
 * Default ranking configuration
 */
export const DEFAULT_RANKING_CONFIG: RankingConfig = {
  baseWeight: 0.7, // Similarity gets 70% weight
  recencyWeight: 0.15, // Recency gets 15% weight
  frequencyWeight: 0.15, // Access frequency gets 15% weight
  recencyDecayDays: 90, // Pages older than 90 days get minimal recency boost
};

/**
 * RRF (Reciprocal Rank Fusion) configuration
 */
export const RRF_CONFIG = {
  K: 60, // Standard RRF constant from research
  SEARCH_MULTIPLIER: 3, // Get 3x more results (increased for sparse high-threshold semantic results)
  DEFAULT_ALPHA: 0.7, // Default weight: 70% semantic, 30% keyword (semantic is high-precision)
} as const;

/**
 * Performance tuning constants
 */
export const PERFORMANCE_CONFIG = {
  // Search optimization
  PHASE_1_MULTIPLIER: 3, // Get 3x more candidates for passage re-ranking
  MIN_SIMILARITY_THRESHOLD: 0.70, // Validated optimal threshold

  // Caching
  QUERY_CACHE_SIZE: 100,
  QUERY_CACHE_TTL: 5 * 60 * 1000, // 5 minutes

  // Batch processing
  EMBEDDING_BATCH_SIZE: 5,
  MAX_CONCURRENT_QUERIES: 3,

  // Database optimization
  METADATA_CACHE_SIZE: 50,
  STATS_CACHE_TTL: 30 * 1000, // 30 seconds
} as const;

/**
 * Content processing configuration
 */
export const CONTENT_CONFIG = {
  // Content extraction
  MIN_CONTENT_LENGTH: 100,
  MAX_CONTENT_LENGTH: 10000,
  MIN_PASSAGE_COUNT: 1,

  // Passage processing
  PASSAGE_QUALITY_THRESHOLD: 0.3,
  TOP_PASSAGES_FOR_EMBEDDING: 5,

  // Dynamic content detection
  SPA_WAIT_TIMEOUT: 2500,
  MIN_CHARS_BEFORE_TIMEOUT: 250,
} as const;

/**
 * Development vs production configuration
 */
export const ENV_CONFIG = {
  // Enable detailed logging in development
  VERBOSE_LOGGING: process.env.NODE_ENV !== 'production',

  // Performance monitoring
  TRACK_METRICS: process.env.NODE_ENV !== 'production',

  // Cache settings
  ENABLE_CACHING: true,

  // Batch processing (smaller batches in development for debugging)
  BATCH_SIZE: process.env.NODE_ENV === 'production' ? 5 : 2,
} as const;

/**
 * Get environment-aware configuration
 */
export function getConfig() {
  return {
    search: DEFAULT_SEARCH_OPTIONS,
    ranking: DEFAULT_RANKING_CONFIG,
    rrf: RRF_CONFIG,
    performance: PERFORMANCE_CONFIG,
    content: CONTENT_CONFIG,
    env: ENV_CONFIG,
  };
}