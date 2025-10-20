/**
 * Hybrid Search - Combines semantic and keyword search using Reciprocal Rank Fusion
 */

import type { SearchResult, SearchOptions, SearchMode } from './types';
import { searchSimilar } from './VectorSearch';
import { keywordSearch } from './KeywordSearch';
import { embeddingGemmaService } from '../embeddings/EmbeddingGemmaService';
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
 * Weighted Reciprocal Rank Fusion (RRF) algorithm
 * Combines ranked lists from multiple sources with configurable weights
 * Formula: score = Σ(weight * (1 / (k + rank))) where k=60
 *
 * @param rankedLists Array of ranked result lists
 * @param weights Weight for each list (e.g., [0.7, 0.3] for 70% semantic, 30% keyword)
 * @param k RRF constant (default: 60)
 * @returns Combined results with weighted RRF scores
 */
function weightedReciprocalRankFusion(
  rankedLists: SearchResult[][],
  weights: number[] = [1.0, 1.0],
  k: number = RRF_CONFIG.K
): SearchResult[] {
  const scoreMap = new Map<string, SearchResult>();

  // Normalize weights to sum to 1.0
  const totalWeight = weights.reduce((sum, w) => sum + w, 0);
  const normalizedWeights = weights.map(w => w / totalWeight);

  for (let i = 0; i < rankedLists.length; i++) {
    const rankedList = rankedLists[i];
    const weight = normalizedWeights[i] || 1.0;

    rankedList.forEach((result, index) => {
      const rank = index + 1; // 1-indexed rank
      const rrfScore = weight * (1 / (k + rank));

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
 * Calculate confidence level for a search result
 * - high: Strong semantic match (>= 0.70) or both semantic + keyword agree
 * - medium: Decent keyword score but weak/no semantic
 * - low: Weak match overall
 */
function calculateConfidence(similarity: number, keywordScore?: number): 'high' | 'medium' | 'low' {
  const hasStrongSemantic = similarity >= 0.70;
  const hasKeyword = (keywordScore || 0) > 0;
  const hasStrongKeyword = (keywordScore || 0) > 0.5;

  if (hasStrongSemantic && hasKeyword) {
    return 'high'; // Both agree - highest confidence
  } else if (hasStrongSemantic) {
    return 'high'; // Strong semantic alone is trusted
  } else if (hasStrongKeyword) {
    return 'medium'; // Keyword fallback - decent confidence
  } else {
    return 'low'; // Weak match overall
  }
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
        // Use 'query' task type for search queries
        const queryEmbedding = await embeddingGemmaService.generateEmbedding(query, 'query');
        const results = await searchSimilar(queryEmbedding, options);

      // Add searchMode metadata and confidence
      return results.map(r => ({
        ...r,
        searchMode: 'semantic' as SearchMode,
        confidence: r.similarity >= 0.70 ? 'high' as const : 'medium' as const,
      }));
    }

    // Keyword-only mode
    if (mode === 'keyword') {
      loggers.hybridSearch.debug('Running keyword search only');
      const keywordResults = await keywordSearch.search(query, { k: opts.k });

      // Convert to SearchResult format with confidence
      return keywordResults.map((kr) => ({
        page: kr.page,
        similarity: 0, // Not applicable for keyword-only
        relevanceScore: kr.score,
        keywordScore: kr.score,
        matchedTerms: kr.matchedTerms,
        searchMode: 'keyword' as SearchMode,
        confidence: kr.score > 0.5 ? 'medium' as const : 'low' as const,
      }));
    }

    // Hybrid mode: Run both searches in parallel and combine with weighted RRF
    loggers.hybridSearch.debug('Running hybrid search (semantic + keyword + weighted RRF)');

    // Get alpha parameter (default: 0.7 = 70% semantic, 30% keyword)
    const alpha = options.alpha !== undefined ? options.alpha : RRF_CONFIG.DEFAULT_ALPHA;
    loggers.hybridSearch.debug('Using alpha:', alpha, '(semantic weight)');

    const [queryEmbedding, keywordResults] = await Promise.all([
      // Use 'query' task type for search queries
      embeddingGemmaService.generateEmbedding(query, 'query'),
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

    // Apply weighted RRF fusion (semantic gets alpha weight, keyword gets 1-alpha)
    const fusedResults = weightedReciprocalRankFusion(
      [semanticResults, keywordAsSearchResults],
      [alpha, 1 - alpha]
    );

    // Enrich results with metadata and confidence scoring
    const enrichedResults = fusedResults.map(result => {
      const keywordMatch = keywordResults.find(kr => kr.page.id === result.page.id);
      const semanticMatch = semanticResults.find(sr => sr.page.id === result.page.id);
      
      const similarity = semanticMatch?.similarity || 0;
      const keywordScore = keywordMatch?.score;
      
      // Calculate confidence level
      const confidence = calculateConfidence(similarity, keywordScore);

      return {
        ...result,
        similarity,
        keywordScore,
        matchedTerms: keywordMatch?.matchedTerms,
        searchMode: 'hybrid' as SearchMode,
        confidence,
      };
    });

    // Return top-k results
    const topResults = enrichedResults.slice(0, opts.k);

    loggers.hybridSearch.debug('Weighted RRF fusion complete, returning top', topResults.length, 'results');
    loggers.hybridSearch.debug('Confidence distribution:', {
      high: topResults.filter(r => r.confidence === 'high').length,
      medium: topResults.filter(r => r.confidence === 'medium').length,
      low: topResults.filter(r => r.confidence === 'low').length,
    });

      // Cache the result
      globalCaches.queryCache.set(cacheKey, topResults);

      return topResults;
    });
  }
}

// Export singleton instance
export const hybridSearch = new HybridSearch();
