/**
 * Information Retrieval Metrics for Eval
 */

import type { EvalQuery } from './dataset';

export interface MetricResult {
  /** Precision@K: % of retrieved docs that are relevant */
  precision: number;

  /** Recall@K: % of relevant docs that were retrieved */
  recall: number;

  /** Mean Reciprocal Rank: 1/rank of first relevant result */
  mrr: number;

  /** Normalized Discounted Cumulative Gain: considers graded relevance */
  ndcg: number;

  /** Average similarity score of top-K results */
  avgSimilarity: number;

  /** Number of results returned */
  numResults: number;
}

export interface RankedResult {
  url: string;
  similarity: number;
}

/**
 * Calculate all metrics for a query
 */
export function calculateMetrics(
  rankedResults: RankedResult[],
  groundTruth: EvalQuery,
  k: number = 10
): MetricResult {
  const topK = rankedResults.slice(0, k);

  // Precision@K
  const relevantInTopK = topK.filter(r =>
    groundTruth.expectedUrls.includes(r.url)
  ).length;
  const precision = topK.length === 0 ? 0 : relevantInTopK / topK.length;

  // Recall@K
  const totalRelevant = groundTruth.expectedUrls.length;
  const recall = totalRelevant === 0 ? 0 : relevantInTopK / totalRelevant;

  // MRR (Mean Reciprocal Rank)
  const firstRelevantIdx = topK.findIndex(r =>
    groundTruth.expectedUrls.includes(r.url)
  );
  const mrr = firstRelevantIdx === -1 ? 0 : 1 / (firstRelevantIdx + 1);

  // NDCG (Normalized Discounted Cumulative Gain)
  const ndcg = calculateNDCG(topK, groundTruth.relevance, k);

  // Average similarity
  const avgSimilarity = topK.length === 0
    ? 0
    : topK.reduce((sum, r) => sum + r.similarity, 0) / topK.length;

  return {
    precision,
    recall,
    mrr,
    ndcg,
    avgSimilarity,
    numResults: topK.length,
  };
}

/**
 * Calculate Normalized Discounted Cumulative Gain
 * Considers graded relevance (0-5 scale) and position in ranking
 */
function calculateNDCG(
  results: RankedResult[],
  relevanceMap: Record<string, number>,
  k: number
): number {
  // DCG: sum of (relevance / log2(position + 1))
  const dcg = results.slice(0, k).reduce((sum, r, idx) => {
    const relevance = relevanceMap[r.url] || 0;
    const position = idx + 1;
    // log2(position + 1) ensures first position gets full weight
    return sum + relevance / Math.log2(position + 1);
  }, 0);

  // IDCG: ideal DCG with perfect ranking
  const idealOrder = Object.entries(relevanceMap)
    .map(([_, score]) => score)
    .sort((a, b) => b - a)
    .slice(0, k);

  const idcg = idealOrder.reduce((sum, rel, idx) => {
    const position = idx + 1;
    return sum + rel / Math.log2(position + 1);
  }, 0);

  // Normalize
  return idcg === 0 ? 0 : dcg / idcg;
}

/**
 * Aggregate metrics across multiple queries
 */
export function aggregateMetrics(results: MetricResult[]): {
  avgPrecision: number;
  avgRecall: number;
  avgMRR: number;
  avgNDCG: number;
  avgSimilarity: number;
} {
  const n = results.length;
  if (n === 0) {
    return {
      avgPrecision: 0,
      avgRecall: 0,
      avgMRR: 0,
      avgNDCG: 0,
      avgSimilarity: 0,
    };
  }

  return {
    avgPrecision: results.reduce((sum, r) => sum + r.precision, 0) / n,
    avgRecall: results.reduce((sum, r) => sum + r.recall, 0) / n,
    avgMRR: results.reduce((sum, r) => sum + r.mrr, 0) / n,
    avgNDCG: results.reduce((sum, r) => sum + r.ndcg, 0) / n,
    avgSimilarity: results.reduce((sum, r) => sum + r.avgSimilarity, 0) / n,
  };
}

/**
 * Format a number as percentage
 */
export function formatPercent(value: number): string {
  return (value * 100).toFixed(1) + '%';
}

/**
 * Format a number to 3 decimal places
 */
export function formatScore(value: number): string {
  return value.toFixed(3);
}
