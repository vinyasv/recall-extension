/**
 * Hybrid Search - Combines semantic and keyword search using Reciprocal Rank Fusion
 */

import type { SearchResult, SearchOptions, SearchMode } from './types';
import { searchSimilar } from './VectorSearch';
import { keywordSearch } from './KeywordSearch';
import { embeddingService } from '../embeddings/EmbeddingService';
import { RRF_CONFIG } from '../config/searchConfig';
import { loggers } from '../utils/logger';
import { globalCaches, cacheKeys } from '../utils/cache';

/**
 * Default search options
 */
const DEFAULT_OPTIONS: Required<Pick<SearchOptions, 'k' | 'mode'>> = {
  k: 10,
  mode: 'hybrid',
};

/**
 * Reciprocal Rank Fusion (RRF) algorithm
 * Combines ranked lists from multiple sources
 * Formula: score = Σ(1 / (k + rank)) where k=60
 *
 * @param rankedLists Array of ranked result lists
 * @param k RRF constant (default: 60)
 * @returns Combined results with RRF scores
 */
function reciprocalRankFusion(
  rankedLists: SearchResult[][],
  k: number = RRF_CONFIG.K
): SearchResult[] {
  const scoreMap = new Map<string, SearchResult>();

  for (const rankedList of rankedLists) {
    rankedList.forEach((result, index) => {
      const rank = index + 1; // 1-indexed rank
      const rrfScore = 1 / (k + rank);

      const existing = scoreMap.get(result.page.id);
      if (existing) {
        // Combine scores if page appears in multiple lists
        existing.relevanceScore += rrfScore;
      } else {
        // First time seeing this page
        scoreMap.set(result.page.id, {
          ...result,
          relevanceScore: rrfScore,
        });
      }
    });
  }

  // Convert map to array and sort by combined RRF score
  const combined = Array.from(scoreMap.values());
  combined.sort((a, b) => b.relevanceScore - a.relevanceScore);

  return combined;
}

/**
 * HybridSearch class - Combines semantic and keyword search
 */
export class HybridSearch {
  /**
   * Search using hybrid approach (semantic + keyword + RRF fusion)
   *
   * @param query Search query string
   * @param options Search options
   * @returns Array of search results sorted by relevance
   */
  async search(query: string, options: SearchOptions = {}): Promise<SearchResult[]> {
    return loggers.hybridSearch.timedAsync('hybrid-search', async () => {
      const opts = { ...DEFAULT_OPTIONS, ...options };
      const mode = opts.mode || 'hybrid';
      const cacheKey = cacheKeys.searchQuery(query, opts);

      // Check cache first
      const cached = globalCaches.queryCache.get(cacheKey);
      if (cached) {
        loggers.hybridSearch.debug('Cache hit for hybrid search');
        return cached;
      }

      loggers.hybridSearch.debug('Searching with mode:', mode, 'query:', query);

      // Semantic-only mode
      if (mode === 'semantic') {
        loggers.hybridSearch.debug('Running semantic search only');
        const queryEmbedding = await embeddingService.generateEmbedding(query);
        const results = await searchSimilar(queryEmbedding, options);

      // Add searchMode metadata
      return results.map(r => ({
        ...r,
        searchMode: 'semantic' as SearchMode,
      }));
    }

    // Keyword-only mode
    if (mode === 'keyword') {
      loggers.hybridSearch.debug('Running keyword search only');
      const keywordResults = await keywordSearch.search(query, { k: opts.k });

      // Convert to SearchResult format
      return keywordResults.map((kr) => ({
        page: kr.page,
        similarity: 0, // Not applicable for keyword-only
        relevanceScore: kr.score,
        keywordScore: kr.score,
        matchedTerms: kr.matchedTerms,
        searchMode: 'keyword' as SearchMode,
      }));
    }

    // Hybrid mode: Run both searches in parallel and combine with RRF
    loggers.hybridSearch.debug('Running hybrid search (semantic + keyword + RRF)');

    const [queryEmbedding, keywordResults] = await Promise.all([
      embeddingService.generateEmbedding(query),
      keywordSearch.search(query, { k: opts.k * RRF_CONFIG.SEARCH_MULTIPLIER }),
    ]);

    const semanticResults = await searchSimilar(queryEmbedding, {
      ...options,
      k: opts.k * RRF_CONFIG.SEARCH_MULTIPLIER,
    });

    loggers.hybridSearch.debug('Semantic results:', semanticResults.length);
    loggers.hybridSearch.debug('Keyword results:', keywordResults.length);

    // Convert keyword results to SearchResult format for RRF
    const keywordAsSearchResults: SearchResult[] = keywordResults.map(kr => ({
      page: kr.page,
      similarity: 0,
      relevanceScore: kr.score,
      keywordScore: kr.score,
      matchedTerms: kr.matchedTerms,
    }));

    // Apply RRF fusion
    const fusedResults = reciprocalRankFusion([semanticResults, keywordAsSearchResults]);

    // Enrich results with metadata from both sources
    const enrichedResults = fusedResults.map(result => {
      const keywordMatch = keywordResults.find(kr => kr.page.id === result.page.id);
      const semanticMatch = semanticResults.find(sr => sr.page.id === result.page.id);

      return {
        ...result,
        similarity: semanticMatch?.similarity || 0,
        keywordScore: keywordMatch?.score,
        matchedTerms: keywordMatch?.matchedTerms,
        searchMode: 'hybrid' as SearchMode,
      };
    });

    // Return top-k results
    const topResults = enrichedResults.slice(0, opts.k);

    loggers.hybridSearch.debug('RRF fusion complete, returning top', topResults.length, 'results');

      // Cache the result
      globalCaches.queryCache.set(cacheKey, topResults);

      return topResults;
    });
  }
}

// Export singleton instance
export const hybridSearch = new HybridSearch();
