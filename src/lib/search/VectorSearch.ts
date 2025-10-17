/**
 * Vector Search - Semantic search using cosine similarity and k-NN
 */

import type { PageRecord, PageMetadata } from '../storage/types';
import type { SearchResult, SearchOptions, RankingConfig } from './types';
import { vectorStore } from '../storage/VectorStore';
import { DEFAULT_SEARCH_OPTIONS, DEFAULT_RANKING_CONFIG, PERFORMANCE_CONFIG } from '../config/searchConfig';
import { loggers } from '../utils/logger';
import { globalCaches, cacheKeys, hashEmbedding } from '../utils/cache';

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
 * @param page Page record or metadata
 * @param options Search options
 * @param config Ranking configuration
 * @returns Combined relevance score
 */
function calculateRelevance(
  similarity: number,
  page: PageRecord | PageMetadata,
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
 * Perform k-NN semantic search with two-phase lazy loading
 * Phase 1: Fast search using page-level metadata only
 * Phase 2: Load full passages for top candidates and re-rank
 * @param queryEmbedding Query embedding vector
 * @param options Search options
 * @returns Array of search results sorted by relevance
 */
export async function searchSimilar(
  queryEmbedding: Float32Array,
  options: SearchOptions = {}
): Promise<SearchResult[]> {
  return loggers.vectorSearch.timedAsync('semantic-search', async () => {
    const opts: Required<SearchOptions> = {
      ...DEFAULT_SEARCH_OPTIONS,
      mode: 'semantic' as const,
      alpha: 0.5,
      ...options
    };
    const embeddingHash = hashEmbedding(queryEmbedding);
    const cacheKey = cacheKeys.vectorSearch(embeddingHash, opts);

    // Check cache first
    const cached = globalCaches.queryCache.get(cacheKey);
    if (cached) {
      loggers.vectorSearch.debug('Cache hit for semantic search');
      return cached;
    }

    loggers.vectorSearch.debug('Two-phase search with options:', opts);

    // Phase 1: Fast search using page metadata only
    const pageMetadata = await vectorStore.getAllPageMetadata();

    if (pageMetadata.length === 0) {
      loggers.vectorSearch.debug('No pages in database');
      return [];
    }

    loggers.vectorSearch.debug('Phase 1: Searching across', pageMetadata.length, 'pages using metadata only');

  // Calculate page-level similarities and find candidates
  const candidates: Array<{
    metadata: PageMetadata;
    similarity: number;
    relevanceScore: number;
  }> = [];

  for (const metadata of pageMetadata) {
    const similarity = cosineSimilarity(queryEmbedding, metadata.embedding);

    // Skip if below threshold
    if (similarity < opts.minSimilarity) {
      continue;
    }

    const relevanceScore = calculateRelevance(similarity, metadata, opts, DEFAULT_RANKING_CONFIG);

    candidates.push({
      metadata,
      similarity,
      relevanceScore,
    });
  }

  // Sort by relevance and get more candidates than needed (for passage-level re-ranking)
  candidates.sort((a, b) => b.relevanceScore - a.relevanceScore);
  const topCandidates = candidates.slice(0, opts.k * PERFORMANCE_CONFIG.PHASE_1_MULTIPLIER);

  loggers.vectorSearch.debug('Phase 1 complete:', candidates.length, 'candidates, selecting top', topCandidates.length, 'for Phase 2');

  if (topCandidates.length === 0) {
    return [];
  }

  // Phase 2: Load full pages and passages for top candidates, then re-rank
  loggers.vectorSearch.debug('Phase 2: Loading full pages for passage-level re-ranking');

  const finalResults: SearchResult[] = [];

  for (const candidate of topCandidates) {
    // Load full page with passages
    const fullPage = await vectorStore.getPage(candidate.metadata.id);

    if (!fullPage) {
      continue;
    }

    let maxSimilarity = candidate.similarity; // Start with page-level similarity
    let passageMatches = 0;

    // Check passage-level similarities for better granularity
    if (fullPage.passages && fullPage.passages.length > 0) {
      for (const passage of fullPage.passages) {
        if (passage.embedding) {
          const passageSimilarity = cosineSimilarity(queryEmbedding, passage.embedding);

          // Note: Don't apply threshold filtering here - let passage-level results
        // be considered for re-ranking even if below threshold. The main threshold
        // filtering in Phase 1 is sufficient for quality control.

          maxSimilarity = Math.max(maxSimilarity, passageSimilarity);
          passageMatches++;
        }
      }
    }

    // Calculate final relevance score with passage boost
    const finalRelevanceScore = calculateRelevance(maxSimilarity, fullPage, opts, DEFAULT_RANKING_CONFIG);
    const passageBoost = passageMatches > 0 ? Math.log(passageMatches + 1) * 0.1 : 0;

    finalResults.push({
      page: fullPage,
      similarity: maxSimilarity,
      relevanceScore: finalRelevanceScore + passageBoost,
      searchMode: 'semantic',
    });
  }

  // Sort by final relevance score (descending)
  finalResults.sort((a, b) => b.relevanceScore - a.relevanceScore);

  // Return top-k results
  const topResults = finalResults.slice(0, opts.k);

  loggers.vectorSearch.debug('Phase 2 complete, returning top', topResults.length, 'results from', finalResults.length, 'candidates');

  // Cache the result
  globalCaches.queryCache.set(cacheKey, topResults);

  return topResults;
  });
}

/**
 * Find pages similar to a given page
 * @param pageId ID of the page to find similar pages for
 * @param options Search options
 * @returns Array of search results (excluding the original page)
 */
export async function findSimilarPages(pageId: string, options: SearchOptions = {}): Promise<SearchResult[]> {
  const page = await vectorStore.getPage(pageId);

  if (!page) {
    throw new Error(`Page not found: ${pageId}`);
  }

  // Search using the page's embedding
  const results = await searchSimilar(page.embedding, options);

  // Filter out the original page
  return results.filter((result) => result.page.id !== pageId);
}
