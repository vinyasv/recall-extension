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

function sanitizeAlpha(alpha: number | undefined): number {
  if (typeof alpha !== 'number' || Number.isNaN(alpha)) {
    return RRF_CONFIG.DEFAULT_ALPHA;
  }

  const clamped = Math.min(Math.max(alpha, 0), 1);

  if (clamped !== alpha) {
    loggers.hybridSearch.warn('Alpha weight out of range; clamping', alpha, '→', clamped);
  }

  return clamped;
}

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
  k: number = RRF_CONFIG.K,
  sourceLabels: string[] = []
): Array<SearchResult & { fusionScore: number; sourceScores: Record<string, number> }> {
  if (rankedLists.length === 0) {
    return [];
  }

  const listCount = rankedLists.length;
  const defaultWeight = 1 / listCount;
  let normalizedWeights: number[];

  const hasInvalidWeights =
    weights.length !== listCount ||
    weights.some((w) => !Number.isFinite(w) || w < 0);

  if (hasInvalidWeights) {
    loggers.hybridSearch.warn(
      'Invalid RRF weights provided; reverting to uniform distribution for',
      listCount,
      'lists'
    );
    normalizedWeights = new Array(listCount).fill(defaultWeight);
  } else {
    const totalWeight = weights.reduce((sum, w) => sum + w, 0);
    normalizedWeights =
      totalWeight === 0
        ? new Array(listCount).fill(defaultWeight)
        : weights.map(w => w / totalWeight);
  }

  const scoreMap = new Map<
    string,
    { result: SearchResult; fusionScore: number; sourceScores: Record<string, number> }
  >();

  rankedLists.forEach((rankedList, listIndex) => {
    const weight = normalizedWeights[listIndex] ?? defaultWeight;
    const sourceKey = sourceLabels[listIndex] ?? `source_${listIndex}`;

    rankedList.forEach((result, index) => {
      const rank = index + 1; // 1-indexed rank
      const rrfScore = weight * (1 / (k + rank));

      const existing = scoreMap.get(result.page.id);
      if (existing) {
        existing.fusionScore += rrfScore;
        existing.sourceScores[sourceKey] = (existing.sourceScores[sourceKey] || 0) + rrfScore;
      } else {
        const sourceScores: Record<string, number> = {
          [sourceKey]: rrfScore,
        };
        scoreMap.set(result.page.id, {
          result,
          fusionScore: rrfScore,
          sourceScores,
        });
      }
    });
  });

  const combined = Array.from(scoreMap.values()).map(({ result, fusionScore, sourceScores }) => ({
    ...result,
    fusionScore,
    sourceScores,
  }));

  combined.sort((a, b) => b.fusionScore - a.fusionScore);

  return combined;
}

/**
 * Calculate confidence level for a search result
 * - high: Strong semantic match (>= 0.68) or both semantic + keyword agree
 * - medium: Decent keyword score but weak/no semantic
 * - low: Weak match overall
 */
function calculateConfidence(similarity: number, keywordScore?: number): 'high' | 'medium' | 'low' {
  const hasStrongSemantic = similarity >= 0.68;
  const hasKeyword = (keywordScore || 0) > 0;
  const hasStrongKeyword = (keywordScore || 0) > 0.5;

  if (hasStrongSemantic && hasKeyword) {
    return 'high'; // Both agree - highest confidence
  } else if (hasStrongSemantic) {
    return 'high'; // Strong semantic alone is trusted
  } else if (similarity >= 0.58 || hasStrongKeyword) {
    return 'medium'; // Mid-band semantic or strong keyword fallback
  }

  return 'low'; // Weak match overall
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
        confidence: calculateConfidence(r.similarity),
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

    // Get alpha parameter (default: 0.9 = 90% semantic, 10% keyword)
    const requestedAlpha = options.alpha !== undefined ? options.alpha : RRF_CONFIG.DEFAULT_ALPHA;
    const alpha = sanitizeAlpha(requestedAlpha);
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
      [alpha, 1 - alpha],
      RRF_CONFIG.K,
      ['semantic', 'keyword']
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
        relevanceScore: semanticMatch?.relevanceScore ?? result.relevanceScore ?? similarity,
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
