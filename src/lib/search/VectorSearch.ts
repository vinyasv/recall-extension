/**
 * Vector Search - Semantic search using cosine similarity and k-NN
 */

import type { PageRecord } from '../storage/types';
import type { SearchResult, SearchOptions, RankingConfig } from './types';
import { vectorStore } from '../storage/VectorStore';

const DEFAULT_OPTIONS: Required<SearchOptions> = {
  k: 10,
  minSimilarity: 0.3,
  boostRecent: true,
  boostFrequent: true,
  recencyWeight: 0.15,
  frequencyWeight: 0.15,
  mode: 'semantic',
  alpha: 0.5,
};

const DEFAULT_RANKING: RankingConfig = {
  baseWeight: 0.7, // Similarity gets 70% weight
  recencyWeight: 0.15, // Recency gets 15% weight
  frequencyWeight: 0.15, // Access frequency gets 15% weight
  recencyDecayDays: 90, // Pages older than 90 days get minimal recency boost
};

/**
 * Calculate cosine similarity between two vectors
 * @param a First vector
 * @param b Second vector
 * @returns Cosine similarity (0-1, higher is better)
 */
export function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length) {
    throw new Error('Vectors must have the same length');
  }

  let dotProduct = 0;
  let magnitudeA = 0;
  let magnitudeB = 0;

  // Compute dot product and magnitudes in a single pass
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    magnitudeA += a[i] * a[i];
    magnitudeB += b[i] * b[i];
  }

  magnitudeA = Math.sqrt(magnitudeA);
  magnitudeB = Math.sqrt(magnitudeB);

  // Handle zero magnitude vectors
  if (magnitudeA === 0 || magnitudeB === 0) {
    return 0;
  }

  const similarity = dotProduct / (magnitudeA * magnitudeB);

  // Clamp to [0, 1] range (should already be in this range for normalized vectors)
  return Math.max(0, Math.min(1, similarity));
}

/**
 * Calculate recency score (0-1, newer is better)
 * @param timestamp Page visit timestamp
 * @param config Ranking configuration
 * @returns Recency score
 */
function calculateRecencyScore(timestamp: number, config: RankingConfig): number {
  const now = Date.now();
  const ageMs = now - timestamp;
  const ageDays = ageMs / (1000 * 60 * 60 * 24);

  // Exponential decay over time
  const score = Math.exp(-ageDays / config.recencyDecayDays);

  return Math.max(0, Math.min(1, score));
}

/**
 * Calculate access frequency score (0-1, more accesses is better)
 * @param lastAccessed Last access timestamp (0 if never accessed)
 * @param timestamp Original visit timestamp
 * @returns Frequency score
 */
function calculateFrequencyScore(lastAccessed: number, timestamp: number): number {
  // If never accessed from search, return 0
  if (lastAccessed === 0 || lastAccessed === timestamp) {
    return 0;
  }

  // Simple heuristic: if accessed from search, give it a boost
  // In the future, this could track access count
  return 0.5;
}

/**
 * Calculate combined relevance score
 * @param similarity Cosine similarity score
 * @param page Page record
 * @param options Search options
 * @param config Ranking configuration
 * @returns Combined relevance score
 */
function calculateRelevance(
  similarity: number,
  page: PageRecord,
  options: Required<SearchOptions>,
  config: RankingConfig
): number {
  let score = similarity * config.baseWeight;

  if (options.boostRecent) {
    const recencyScore = calculateRecencyScore(page.timestamp, config);
    score += recencyScore * options.recencyWeight;
  }

  if (options.boostFrequent) {
    const frequencyScore = calculateFrequencyScore(page.lastAccessed, page.timestamp);
    score += frequencyScore * options.frequencyWeight;
  }

  return score;
}

/**
 * Perform k-NN semantic search
 * @param queryEmbedding Query embedding vector
 * @param options Search options
 * @returns Array of search results sorted by relevance
 */
export async function searchSimilar(
  queryEmbedding: Float32Array,
  options: SearchOptions = {}
): Promise<SearchResult[]> {
  const opts: Required<SearchOptions> = { ...DEFAULT_OPTIONS, ...options };

  console.log('[VectorSearch] Searching with options:', opts);

  // Get all pages from database
  const pages = await vectorStore.getAllPages();

  if (pages.length === 0) {
    console.log('[VectorSearch] No pages in database');
    return [];
  }

  console.log('[VectorSearch] Searching across', pages.length, 'pages');

  // Calculate similarity for each page
  const results: SearchResult[] = [];

  for (const page of pages) {
    // Calculate cosine similarity
    const similarity = cosineSimilarity(queryEmbedding, page.embedding);

    // Skip if below threshold
    if (similarity < opts.minSimilarity) {
      continue;
    }

    // Calculate combined relevance score
    const relevanceScore = calculateRelevance(similarity, page, opts, DEFAULT_RANKING);

    results.push({
      page,
      similarity,
      relevanceScore,
    });
  }

  // Sort by relevance score (descending)
  results.sort((a, b) => b.relevanceScore - a.relevanceScore);

  // Return top-k results
  const topResults = results.slice(0, opts.k);

  console.log('[VectorSearch] Found', results.length, 'matches, returning top', topResults.length);

  return topResults;
}

/**
 * VectorSearch class for managing search operations
 */
export class VectorSearch {
  /**
   * Search for similar pages
   * @param queryEmbedding Query embedding vector
   * @param options Search options
   * @returns Array of search results
   */
  async search(
    queryEmbedding: Float32Array,
    options: SearchOptions = {}
  ): Promise<SearchResult[]> {
    return searchSimilar(queryEmbedding, options);
  }

  /**
   * Find pages similar to a given page
   * @param pageId ID of the page to find similar pages for
   * @param options Search options
   * @returns Array of search results (excluding the original page)
   */
  async findSimilar(pageId: string, options: SearchOptions = {}): Promise<SearchResult[]> {
    const page = await vectorStore.getPage(pageId);

    if (!page) {
      throw new Error(`Page not found: ${pageId}`);
    }

    // Search using the page's embedding
    const results = await this.search(page.embedding, options);

    // Filter out the original page
    return results.filter((result) => result.page.id !== pageId);
  }
}

// Export singleton instance
export const vectorSearch = new VectorSearch();
