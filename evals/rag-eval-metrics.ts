/**
 * RAG Evaluation Metrics
 *
 * Metrics for evaluating RAG quality:
 * 1. Source Relevance: Did it cite the right pages?
 * 2. Keyword Coverage: Does answer contain expected keywords?
 * 3. Answer Appropriateness: Should it answer or say "no information"?
 * 4. Response Time: How fast was the response?
 */

import type { RAGTestCase } from './rag-eval-dataset';

export interface RAGEvalResult {
  testCaseId: string;
  question: string;
  answer: string;
  sources: any[];
  timings: {
    total: number;
    search: number;
    generation: number;
  };

  // Computed metrics
  metrics: {
    sourceRelevanceScore: number; // 0-1: Did it cite expected sources?
    keywordCoverageScore: number; // 0-1: Does answer contain expected keywords?
    appropriatenessScore: number; // 0-1: Did it handle the question correctly?
    responseTimeScore: number; // 0-1: Was it fast enough?
    overallScore: number; // Weighted average
  };

  // Detailed breakdown
  details: {
    expectedSources: string[];
    citedSources: string[];
    matchedSources: string[];
    expectedKeywords: string[];
    foundKeywords: string[];
    shouldNotAnswer: boolean;
    didRefuseToAnswer: boolean;
  };
}

/**
 * Calculate source relevance score
 * Measures if the RAG cited the expected sources
 */
export function calculateSourceRelevance(
  expectedSources: string[],
  citedSources: string[]
): { score: number; matched: string[] } {
  if (expectedSources.length === 0) {
    // No expected sources, score is N/A (return 1.0 to not penalize)
    return { score: 1.0, matched: [] };
  }

  const citedDomains = citedSources.map(extractDomain).filter(Boolean);
  const matched: string[] = [];

  for (const expected of expectedSources) {
    const expectedDomain = extractDomain(expected);
    if (citedDomains.some(cited => cited.includes(expectedDomain) || expectedDomain.includes(cited))) {
      matched.push(expected);
    }
  }

  const score = matched.length / expectedSources.length;
  return { score, matched };
}

/**
 * Calculate keyword coverage score
 * Measures if the answer contains expected keywords
 */
export function calculateKeywordCoverage(
  answer: string,
  expectedKeywords: string[]
): { score: number; found: string[] } {
  if (expectedKeywords.length === 0) {
    // No expected keywords, score is N/A (return 1.0 to not penalize)
    return { score: 1.0, found: [] };
  }

  const answerLower = answer.toLowerCase();
  const found: string[] = [];

  for (const keyword of expectedKeywords) {
    if (answerLower.includes(keyword.toLowerCase())) {
      found.push(keyword);
    }
  }

  const score = found.length / expectedKeywords.length;
  return { score, found };
}

/**
 * Calculate appropriateness score
 * Measures if the RAG correctly handled the question
 * (e.g., refused to answer when it should, or answered when it should)
 */
export function calculateAppropriateness(
  answer: string,
  shouldNotAnswer: boolean
): { score: number; didRefuse: boolean } {
  const refusalPhrases = [
    "couldn't find",
    "don't have",
    "no information",
    "not enough information",
    "unable to answer",
    "can't answer"
  ];

  const didRefuse = refusalPhrases.some(phrase =>
    answer.toLowerCase().includes(phrase)
  );

  let score = 1.0;

  if (shouldNotAnswer && !didRefuse) {
    // Should have refused but didn't - hallucination risk
    score = 0.0;
  } else if (!shouldNotAnswer && didRefuse) {
    // Shouldn't have refused but did - too conservative
    score = 0.0;
  }

  return { score, didRefuse };
}

/**
 * Calculate response time score
 * Penalizes slow responses (> 5 seconds)
 */
export function calculateResponseTime(totalTimeMs: number): number {
  // Target: < 2 seconds = 1.0, > 5 seconds = 0.0
  const targetMs = 2000;
  const maxMs = 5000;

  if (totalTimeMs <= targetMs) {
    return 1.0;
  } else if (totalTimeMs >= maxMs) {
    return 0.0;
  } else {
    // Linear decay between target and max
    return 1.0 - (totalTimeMs - targetMs) / (maxMs - targetMs);
  }
}

/**
 * Extract domain from URL
 */
function extractDomain(url: string): string {
  try {
    const urlObj = new URL(url.startsWith('http') ? url : `https://${url}`);
    return urlObj.hostname.replace('www.', '');
  } catch {
    return url;
  }
}

/**
 * Evaluate a single RAG test case
 */
export function evaluateRAGTestCase(
  testCase: RAGTestCase,
  answer: string,
  sources: any[],
  timings: { total: number; search: number; generation: number }
): RAGEvalResult {
  const expectedSources = testCase.expectedSources || [];
  const expectedKeywords = testCase.expectedKeywords || [];
  const shouldNotAnswer = testCase.shouldNotAnswer || false;

  // Extract cited source URLs
  const citedSources = sources.map(s => s.page?.url || s.url).filter(Boolean);

  // Calculate metrics
  const sourceRelevance = calculateSourceRelevance(expectedSources, citedSources);
  const keywordCoverage = calculateKeywordCoverage(answer, expectedKeywords);
  const appropriateness = calculateAppropriateness(answer, shouldNotAnswer);
  const responseTimeScore = calculateResponseTime(timings.total);

  // Weighted overall score
  // Source relevance: 30%, Keyword coverage: 30%, Appropriateness: 30%, Response time: 10%
  const overallScore =
    (sourceRelevance.score * 0.3) +
    (keywordCoverage.score * 0.3) +
    (appropriateness.score * 0.3) +
    (responseTimeScore * 0.1);

  return {
    testCaseId: testCase.id,
    question: testCase.question,
    answer,
    sources,
    timings,
    metrics: {
      sourceRelevanceScore: sourceRelevance.score,
      keywordCoverageScore: keywordCoverage.score,
      appropriatenessScore: appropriateness.score,
      responseTimeScore,
      overallScore
    },
    details: {
      expectedSources,
      citedSources,
      matchedSources: sourceRelevance.matched,
      expectedKeywords,
      foundKeywords: keywordCoverage.found,
      shouldNotAnswer,
      didRefuseToAnswer: appropriateness.didRefuse
    }
  };
}

/**
 * Aggregate metrics across multiple eval results
 */
export function aggregateMetrics(results: RAGEvalResult[]): {
  avgSourceRelevance: number;
  avgKeywordCoverage: number;
  avgAppropriateness: number;
  avgResponseTime: number;
  avgOverallScore: number;
  totalTests: number;
  passedTests: number; // Overall score >= 0.7
  passRate: number;
} {
  if (results.length === 0) {
    return {
      avgSourceRelevance: 0,
      avgKeywordCoverage: 0,
      avgAppropriateness: 0,
      avgResponseTime: 0,
      avgOverallScore: 0,
      totalTests: 0,
      passedTests: 0,
      passRate: 0
    };
  }

  const sum = results.reduce((acc, r) => ({
    sourceRelevance: acc.sourceRelevance + r.metrics.sourceRelevanceScore,
    keywordCoverage: acc.keywordCoverage + r.metrics.keywordCoverageScore,
    appropriateness: acc.appropriateness + r.metrics.appropriatenessScore,
    responseTime: acc.responseTime + r.metrics.responseTimeScore,
    overallScore: acc.overallScore + r.metrics.overallScore
  }), {
    sourceRelevance: 0,
    keywordCoverage: 0,
    appropriateness: 0,
    responseTime: 0,
    overallScore: 0
  });

  const passThreshold = 0.7;
  const passedTests = results.filter(r => r.metrics.overallScore >= passThreshold).length;

  return {
    avgSourceRelevance: sum.sourceRelevance / results.length,
    avgKeywordCoverage: sum.keywordCoverage / results.length,
    avgAppropriateness: sum.appropriateness / results.length,
    avgResponseTime: sum.responseTime / results.length,
    avgOverallScore: sum.overallScore / results.length,
    totalTests: results.length,
    passedTests,
    passRate: passedTests / results.length
  };
}
