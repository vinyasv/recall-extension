/**
 * Shared constants for content extraction and processing
 */

/**
 * Common selectors for finding main content
 */
export const CONTENT_SELECTORS = [
  'article',
  'main',
  '[role="main"]',
  '[role="article"]',
  '.article-content',
  '.post-content',
  '.entry-content',
  '.content-body',
  '.article-body',
  '#content',
  '#main-content',
  '.main-content',
] as const;

/**
 * Elements and classes to filter out during content extraction
 */
export const UNWANTED_SELECTORS = [
  'script',
  'style',
  'nav',
  'header',
  'footer',
  'aside',
  '.advertisement',
  '.ad',
  '.sidebar',
  '.comments',
  '.related-posts',
  '.menu',
  '[role="navigation"]',
  '[role="banner"]',
  '[role="complementary"]',
  '[role="contentinfo"]',
] as const;

/**
 * Class and ID patterns to exclude
 */
export const EXCLUDE_PATTERNS = [
  'nav',
  'menu',
  'sidebar',
  'footer',
  'header',
  'ad',
  'advertisement',
  'comments',
  'related',
  'social',
] as const;

/**
 * Minimum content requirements
 */
export const CONTENT_REQUIREMENTS = {
  MIN_CHARS: 200,
  MIN_WORDS: 10,
  MAX_CHARS: 10000,
  MIN_PASSAGE_WORDS: 5,
  MAX_PASSAGE_WORDS: 200,
  MAX_PASSAGES_PER_PAGE: 30,
} as const;

/**
 * Document chunking configuration
 */
export const CHUNKER_CONFIG = {
  MAX_WORDS_PER_PASSAGE: 200,
  MAX_PASSAGES_PER_PAGE: 30,
  MIN_WORD_COUNT: 5,
  GREEDILY_AGGREGATE_SIBLINGS: true,

  // Fine-tuning parameters for Chrome-inspired chunking
  SIBLING_MERGE_THRESHOLD: 0.8, // Merge if combined passage would be 80% of max
  PREFER_SEMANTIC_BOUNDARIES: true, // Split at sentence/paragraph boundaries
  MIN_PASSAGE_QUALITY: 0.3, // Filter low-quality passages
  MIN_BOUNDARY_POSITION: 0.5, // Only use boundaries if they're at least 50% through
} as const;

/**
 * Text processing constants
 */
export const TEXT_PROCESSING = {
  MAX_CONTENT_LENGTH: 2000,
  QUALITY_THRESHOLD: 0.3,
  TOP_PASSAGES_FOR_EMBEDDING: 5,
} as const;