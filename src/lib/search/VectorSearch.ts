/**
 * Vector Search - SIMPLIFIED Passage-Only Approach
 *
 * Based on evaluation results: Content passages outperform title passages!
 * - Search ALL passages directly
 * - Filter by threshold (0.70 optimal)
 * - Simple scoring: max similarity + multi-passage bonus
 */

import type { PageRecord } from '../storage/types';
import type { SearchResult, SearchOptions } from './types';
import { vectorStore } from '../storage/VectorStore';
import { DEFAULT_SEARCH_OPTIONS } from '../config/searchConfig';
import { loggers } from '../utils/logger';
import { globalCaches, cacheKeys, hashEmbedding } from '../utils/cache';

/**
 * Calculate dot product between two vectors
 * For normalized vectors (EmbeddingGemma), this equals cosine similarity
 */
export function dotProduct(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length) {
    throw new Error(`Vector dimension mismatch: ${a.length} vs ${b.length}`);
  }

  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    sum += a[i] * b[i];
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
 * - 100% precision @ 0.70 threshold with content passages only
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
      minSimilarity: 0.70, // Optimal from testing
      ...options
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
    const pageScores = new Map<string, {
      page: PageRecord;
      maxSimilarity: number;
      passageMatches: number;
    }>();

    for (const page of allPages) {
      if (!page.passages || page.passages.length === 0) {
        continue;
      }

      let maxSimilarity = 0;
      let passageMatches = 0;

      for (const passage of page.passages) {
        if (!passage.embedding) continue;

        const similarity = dotProduct(queryEmbedding, passage.embedding);

        if (similarity >= opts.minSimilarity) {
          maxSimilarity = Math.max(maxSimilarity, similarity);
          passageMatches++;
        }
      }

      if (passageMatches > 0) {
        pageScores.set(page.id, {
          page,
          maxSimilarity,
          passageMatches,
        });
      }
    }

    loggers.vectorSearch.debug('Found', pageScores.size, 'matching pages');

    // Calculate scores
    const results: SearchResult[] = [];

    for (const [_, pageData] of pageScores) {
      let relevanceScore = pageData.maxSimilarity;

      // Multi-passage bonus
      if (pageData.passageMatches > 1) {
        relevanceScore += Math.log(pageData.passageMatches) * 0.05;
      }

      results.push({
        page: pageData.page,
        similarity: pageData.maxSimilarity,
        relevanceScore,
        searchMode: 'semantic',
      });
    }

    // Sort and limit
    results.sort((a, b) => b.relevanceScore - a.relevanceScore);
    const topResults = results.slice(0, opts.k);

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

