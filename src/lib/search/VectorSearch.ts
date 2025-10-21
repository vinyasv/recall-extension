/**
 * Vector Search - SIMPLIFIED Passage-Only Approach
 *
 * Based on evaluation results: Content passages outperform title passages!
 * - Search ALL passages directly
 * - Retrieve top-k and apply tuned threshold (default 0.58)
 * - Simple scoring: max similarity + multi-passage bonus
 */

import type { SearchResult, SearchOptions } from './types';
import { vectorStore } from '../storage/VectorStore';
import { DEFAULT_SEARCH_OPTIONS } from '../config/searchConfig';
import { loggers } from '../utils/logger';
import { globalCaches, cacheKeys, hashEmbedding } from '../utils/cache';

function estimateSemanticConfidence(similarity: number, threshold?: number): 'high' | 'medium' | 'low' {
  if (threshold !== undefined) {
    if (similarity >= threshold) return 'high';
    if (similarity >= threshold - 0.05) return 'medium';
    return 'low';
  }

  if (similarity >= 0.68) return 'high';
  if (similarity >= 0.55) return 'medium';
  return 'low';
}

/**
 * Verify that a vector is normalized (L2 norm ≈ 1.0)
 * Used for debugging embedding quality issues
 */
function verifyNormalized(vec: Float32Array, label: string = 'vector'): boolean {
  let magnitude = 0;
  for (let i = 0; i < vec.length; i++) {
    magnitude += vec[i] * vec[i];
  }
  const norm = Math.sqrt(magnitude);
  const isNormalized = Math.abs(norm - 1.0) < 0.01; // 1% tolerance
  
  if (!isNormalized) {
    loggers.vectorSearch.warn(`${label} not normalized! L2 norm: ${norm.toFixed(4)} (expected ~1.0)`);
  }
  
  return isNormalized;
}

/**
 * Calculate dot product between two vectors
 * For normalized vectors (EmbeddingGemma), this equals cosine similarity
 * 
 * Note: Assumes both vectors are normalized. Use cosineSimilarity() if unsure.
 */
export function dotProduct(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length) {
    throw new Error(`Vector dimension mismatch: ${a.length} vs ${b.length}`);
  }

  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    sum += a[i] * b[i];
  }

  // Sanity check: similarity should be in [-1, 1] for normalized vectors
  // In practice, should be in [0, 1] for semantic similarity
  if (sum < -1.01 || sum > 1.01) {
    loggers.vectorSearch.warn(`Unusual dot product: ${sum.toFixed(4)} (expected [-1, 1])`);
    // Verify both vectors are normalized
    verifyNormalized(a, 'vector A');
    verifyNormalized(b, 'vector B');
  }

  return sum;
}

/**
 * Calculate cosine similarity (for non-normalized vectors)
 */
export function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length) {
    throw new Error('Vectors must have the same length');
  }

  let dotProd = 0;
  let magnitudeA = 0;
  let magnitudeB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProd += a[i] * b[i];
    magnitudeA += a[i] * a[i];
    magnitudeB += b[i] * b[i];
  }

  const denominator = Math.sqrt(magnitudeA) * Math.sqrt(magnitudeB);
  return denominator === 0 ? 0 : dotProd / denominator;
}

/**
 * Perform semantic search - SIMPLIFIED approach
 * 
 * Testing showed:
 * - Top-k retrieval avoids missing relevant passages below legacy thresholds
 * - Content passages are more discriminating than titles
 * - Simpler = better!
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
      ...options,
    };

    const embeddingHash = hashEmbedding(queryEmbedding);
    const cacheKey = cacheKeys.vectorSearch(embeddingHash, opts);

    // Check cache
    const cached = globalCaches.queryCache.get(cacheKey);
    if (cached) {
      loggers.vectorSearch.debug('Cache hit');
      return cached;
    }

    loggers.vectorSearch.debug('Passage-only search, threshold:', opts.minSimilarity);

    // Load all pages
    const allPages = await vectorStore.getAllPages();

    if (allPages.length === 0) {
      return [];
    }

    loggers.vectorSearch.debug('Searching', allPages.length, 'pages');

    // Search ALL passages, group by page
    const results: SearchResult[] = [];
    const fallbackResults: SearchResult[] = [];

    for (const page of allPages) {
      if (!page.passages || page.passages.length === 0) {
        continue;
      }

      let maxSimilarity = -Infinity;
      let topPassageSnippet: string | undefined;
      let strongMatches = 0;

      for (const passage of page.passages) {
        if (!passage.embedding) continue;

        const similarity = dotProduct(queryEmbedding, passage.embedding);

        if (similarity > maxSimilarity) {
          maxSimilarity = similarity;
          topPassageSnippet = passage.text;
        }

        if (similarity >= opts.minSimilarity) {
          strongMatches++;
        }
      }

      if (maxSimilarity === -Infinity) {
        continue;
      }

      // Calculate relevance score with multi-passage bonus
      // Logarithmic scaling: 2→10%, 5→16%, 10→23% boost
      let relevanceScore = maxSimilarity;
      if (strongMatches > 1) {
        relevanceScore += Math.log(strongMatches) * 0.10;
      }

      const baseResult: SearchResult & { topPassageSnippet?: string } = {
        page,
        similarity: maxSimilarity,
        relevanceScore,
        searchMode: 'semantic',
        confidence: estimateSemanticConfidence(maxSimilarity, opts.minSimilarity),
        topPassageSnippet,
      } as SearchResult & { topPassageSnippet?: string };

      fallbackResults.push(baseResult);

      if (maxSimilarity >= opts.minSimilarity) {
        results.push(baseResult);
      }
    }

    // Smart fallback: only use low-similarity results if they're not completely irrelevant
    let candidates = results;
    
    if (candidates.length === 0) {
      const minFallbackThreshold = 0.45; // Lower bound for fallback
      const potentialFallbacks = fallbackResults.filter(r => r.similarity >= minFallbackThreshold);
      
      if (potentialFallbacks.length > 0) {
        loggers.vectorSearch.debug(
          `No results met threshold (${opts.minSimilarity}), using ${potentialFallbacks.length} fallback results`
        );
        candidates = potentialFallbacks;
      } else {
        loggers.vectorSearch.debug('No relevant results found (all below 0.45 similarity)');
        return []; // Return empty instead of irrelevant results
      }
    }

    loggers.vectorSearch.debug('Found', candidates.length, 'candidate pages');

    // CRITICAL: Sort by relevanceScore (includes multi-passage bonuses), not raw similarity
    candidates.sort((a, b) => b.relevanceScore - a.relevanceScore);
    const topResults = candidates.slice(0, opts.k);

    loggers.vectorSearch.debug('Returning', topResults.length, 'results');

    globalCaches.queryCache.set(cacheKey, topResults);

    return topResults;
  });
}

/**
 * Find similar pages (for "More like this" feature)
 */
export async function findSimilarPages(pageId: string, options: SearchOptions = {}): Promise<SearchResult[]> {
  const page = await vectorStore.getPage(pageId);

  if (!page || !page.passages || page.passages.length === 0) {
    return [];
  }

  // Use first passage embedding as query
  const queryEmbedding = page.passages[0].embedding;
  
  if (!queryEmbedding) {
    return [];
  }

  const results = await searchSimilar(queryEmbedding, options);

  // Exclude the original page
  return results.filter(r => r.page.id !== pageId);
}

