#!/usr/bin/env node
/**
 * Eval Runner - Run search quality evaluations in Node.js
 *
 * This script runs entirely outside of Chrome, using Transformers.js in Node.js
 */

import { EmbeddingService } from '../src/lib/embeddings/EmbeddingService';
import { cosineSimilarity } from '../src/lib/search/VectorSearch';
import { TEST_PAGES, EVAL_QUERIES } from './dataset';
import { calculateMetrics, aggregateMetrics, formatPercent, formatScore, type RankedResult, type MetricResult } from './metrics';

interface IndexedPage {
  url: string;
  title: string;
  summary: string;
  embedding: Float32Array;
}

interface QueryResult {
  query: string;
  description?: string;
  metrics: MetricResult;
  topResults: RankedResult[];
}

/**
 * Main eval function
 */
async function runEval() {
  console.log('🚀 Starting Search Quality Evaluation...\n');

  // 1. Initialize embedding service
  console.log('📦 Initializing embedding service...');
  const embeddingService = new EmbeddingService();
  await embeddingService.initialize();
  console.log('✅ Embedding service ready\n');

  // 2. Index test pages
  console.log(`📚 Indexing ${TEST_PAGES.length} test pages...`);
  const indexedPages: IndexedPage[] = [];

  for (let i = 0; i < TEST_PAGES.length; i++) {
    const page = TEST_PAGES[i];
    process.stdout.write(`   [${i + 1}/${TEST_PAGES.length}] ${page.title.substring(0, 50)}...\r`);

    // Generate embedding with title + summary (matching production)
    const embeddingText = `${page.title}. ${page.summary}`;
    const embedding = await embeddingService.generateEmbedding(embeddingText);

    indexedPages.push({
      url: page.url,
      title: page.title,
      summary: page.summary,
      embedding,
    });
  }
  console.log(`\n✅ Indexed ${indexedPages.length} pages\n`);

  // 3. Run queries
  console.log(`🔍 Running ${EVAL_QUERIES.length} eval queries...\n`);
  const results: QueryResult[] = [];

  for (const evalQuery of EVAL_QUERIES) {
    // Generate query embedding
    const queryEmbedding = await embeddingService.generateEmbedding(evalQuery.query);

    // Calculate similarities and rank
    const ranked: RankedResult[] = indexedPages
      .map(page => ({
        url: page.url,
        title: page.title,
        similarity: cosineSimilarity(queryEmbedding, page.embedding),
      }))
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, 10);

    // Calculate metrics
    const metrics = calculateMetrics(ranked, evalQuery, 10);

    results.push({
      query: evalQuery.query,
      description: evalQuery.description,
      metrics,
      topResults: ranked.slice(0, 5), // Keep top 5 for display
    });
  }

  // 4. Print results
  printReport(results);

  // 5. Print summary
  printSummary(results);
}

/**
 * Print detailed report for each query
 */
function printReport(results: QueryResult[]) {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📊 DETAILED RESULTS');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  results.forEach((result, idx) => {
    console.log(`${idx + 1}. Query: "${result.query}"`);
    if (result.description) {
      console.log(`   ${result.description}`);
    }
    console.log();

    console.log('   Metrics:');
    console.log(`   • Precision@10: ${formatPercent(result.metrics.precision)}`);
    console.log(`   • Recall@10:    ${formatPercent(result.metrics.recall)}`);
    console.log(`   • MRR:          ${formatScore(result.metrics.mrr)}`);
    console.log(`   • NDCG:         ${formatScore(result.metrics.ndcg)}`);
    console.log(`   • Avg Sim:      ${formatScore(result.metrics.avgSimilarity)}`);
    console.log();

    console.log('   Top 5 Results:');
    result.topResults.forEach((r, i) => {
      const title = (r as any).title || r.url;
      console.log(`   ${i + 1}. [${formatScore(r.similarity)}] ${title.substring(0, 60)}`);
    });
    console.log();
  });
}

/**
 * Print aggregate summary
 */
function printSummary(results: QueryResult[]) {
  const metrics = results.map(r => r.metrics);
  const agg = aggregateMetrics(metrics);

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📈 AGGREGATE METRICS');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  console.log(`   Average Precision@10:  ${formatPercent(agg.avgPrecision)}`);
  console.log(`   Average Recall@10:     ${formatPercent(agg.avgRecall)}`);
  console.log(`   Average MRR:           ${formatScore(agg.avgMRR)}`);
  console.log(`   Average NDCG:          ${formatScore(agg.avgNDCG)}`);
  console.log(`   Average Similarity:    ${formatScore(agg.avgSimilarity)}`);
  console.log();

  // Quality assessment
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🎯 QUALITY ASSESSMENT');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  // Define quality thresholds
  const thresholds = {
    precision: 0.30,  // 30% of results should be relevant
    recall: 0.50,     // Should find 50% of relevant docs
    mrr: 0.50,        // First relevant result in top 2 on average
    ndcg: 0.60,       // Good ranking quality
  };

  const checks = [
    { name: 'Precision@10', value: agg.avgPrecision, threshold: thresholds.precision },
    { name: 'Recall@10', value: agg.avgRecall, threshold: thresholds.recall },
    { name: 'MRR', value: agg.avgMRR, threshold: thresholds.mrr },
    { name: 'NDCG', value: agg.avgNDCG, threshold: thresholds.ndcg },
  ];

  let passed = 0;
  checks.forEach(check => {
    const status = check.value >= check.threshold ? '✅' : '❌';
    const comparison = check.value >= check.threshold ? '≥' : '<';
    console.log(`   ${status} ${check.name}: ${formatScore(check.value)} ${comparison} ${formatScore(check.threshold)}`);
    if (check.value >= check.threshold) passed++;
  });

  console.log();
  console.log(`   Overall: ${passed}/${checks.length} checks passed`);
  console.log();

  if (passed === checks.length) {
    console.log('   🎉 All quality checks passed!');
  } else if (passed >= checks.length / 2) {
    console.log('   ⚠️  Some quality checks failed. Consider improvements.');
  } else {
    console.log('   🚨 Multiple quality checks failed. Search needs improvement.');
  }
  console.log();
}

/**
 * Run the eval
 */
runEval().catch(error => {
  console.error('\n❌ Eval failed:', error);
  process.exit(1);
});
