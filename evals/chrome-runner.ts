#!/usr/bin/env node
/**
 * Chrome-based Eval Runner
 *
 * Automates running evals in Chrome with the extension loaded.
 * This tests the REAL Chrome Summarizer API with sharedContext!
 */

import puppeteer, { Browser, Page } from 'puppeteer';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { calculateMetrics, aggregateMetrics, formatPercent, formatScore } from './metrics';
import type { MetricResult } from './metrics';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface QueryResult {
  query: string;
  description?: string;
  expectedUrls: string[];
  relevance: Record<string, number>;
  results: Array<{ url: string; title: string; similarity: number }>;
  duration: number;
}

interface EvalResponse {
  success: boolean;
  summarizerAvailable: boolean;
  indexingResults: Array<{
    url: string;
    success: boolean;
    duration: number;
    summaryLength?: number;
    error?: string;
  }>;
  queryResults: QueryResult[];
}

async function runChromeEval() {
  console.log('🚀 Starting Chrome-based Evaluation...\n');

  let browser: Browser | null = null;
  let page: Page | null = null;

  try {
    // Path to extension
    const extensionPath = path.resolve(__dirname, '../dist');
    console.log('📦 Extension path:', extensionPath);

    console.log('\n🔧 Launching Chrome with extension...');

    // Launch Chrome with extension loaded
    browser = await puppeteer.launch({
      headless: false, // Must be false to load extensions
      protocolTimeout: 600000, // 10 minutes for long-running eval
      args: [
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`,
        '--no-sandbox',
        '--disable-setuid-sandbox',
      ],
      defaultViewport: {
        width: 1280,
        height: 900,
      },
    });

    // Get pages
    const pages = await browser.pages();
    page = pages[0];

    console.log('✅ Chrome launched\n');

    const extensionId = await waitForExtensionId(browser);
    console.log('🪪 Extension ID:', extensionId);

    // Navigate to eval page hosted within the extension
    const evalPageUrl = `chrome-extension://${extensionId}/chrome-eval.html?autorun=true`;
    console.log('🌐 Eval page:', evalPageUrl);

    // Navigate to eval page
    console.log('📄 Loading eval page...');
    await page.goto(evalPageUrl, { waitUntil: 'networkidle0' });

    // Allow extension scripts to finish booting
    await new Promise(resolve => setTimeout(resolve, 2000));

    console.log('⏳ Running eval (this may take a while)...\n');

    // Wait for eval to complete (look for success or error status)
    await page.waitForFunction(
      () => {
        const statusEl = document.getElementById('status');
        if (!statusEl) return false;
        const className = statusEl.className;
        return className.includes('success') || className.includes('error');
      },
      { timeout: 600000 } // 10 minutes timeout
    );

    // Check if it succeeded or failed
    const statusClass = await page.evaluate(() => {
      const statusEl = document.getElementById('status');
      return statusEl?.className || '';
    });

    if (statusClass.includes('error')) {
      const errorText = await page.evaluate(() => {
        const statusEl = document.getElementById('status');
        return statusEl?.textContent || 'Unknown error';
      });
      throw new Error(errorText);
    }

    console.log('✅ Eval completed in Chrome\n');

    // Extract results from the page
    console.log('📊 Extracting results...\n');

    const evalResults: EvalResponse = await page.evaluate(() => {
      // @ts-ignore - evalResults is set by the HTML page
      return window.evalResults;
    });

    if (!evalResults) {
      throw new Error('No eval results found');
    }

    // Print results
    printResults(evalResults);

    console.log('\n✨ Eval complete! Browser will stay open for inspection.');
    console.log('   Press Ctrl+C to close.');

    // Keep browser open for inspection
    await new Promise(() => {}); // Never resolves - keeps browser open

  } catch (error) {
    console.error('\n❌ Eval failed:', error);
    process.exit(1);
  }
}

async function waitForExtensionId(browser: Browser, timeoutMs = 10000): Promise<string> {
  const target = await browser.waitForTarget(
    candidate => {
      const url = candidate.url();
      if (!url.startsWith('chrome-extension://')) return false;

      const type = candidate.type();
      return type === 'service_worker' || type === 'background_page' || type === 'page';
    },
    { timeout: timeoutMs }
  );

  if (!target) {
    throw new Error('Failed to determine extension ID');
  }

  const url = target.url();
  const [, , extensionId] = url.split('/');
  if (!extensionId) {
    throw new Error(`Unable to parse extension ID from URL: ${url}`);
  }

  return extensionId;
}

function printResults(evalResults: EvalResponse) {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📈 CHROME EVAL RESULTS');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  // Summarizer API status
  if (evalResults.summarizerAvailable) {
    console.log('✅ Chrome Summarizer API: AVAILABLE (using sharedContext!)');
  } else {
    console.log('⚠️  Chrome Summarizer API: NOT AVAILABLE (using fallback)');
  }
  console.log();

  // Indexing stats
  const successfulIndexing = evalResults.indexingResults.filter(r => r.success).length;
  const failedIndexing = evalResults.indexingResults.filter(r => !r.success).length;
  const avgIndexingTime = evalResults.indexingResults.reduce((sum, r) => sum + r.duration, 0) / evalResults.indexingResults.length;
  const avgSummaryLength = evalResults.indexingResults
    .filter(r => r.success && r.summaryLength)
    .reduce((sum, r) => sum + (r.summaryLength || 0), 0) / successfulIndexing;

  console.log('📚 Indexing Performance:');
  console.log(`   • Pages indexed: ${successfulIndexing}/${evalResults.indexingResults.length}`);
  console.log(`   • Failed: ${failedIndexing}`);
  console.log(`   • Avg time per page: ${avgIndexingTime.toFixed(0)}ms`);
  console.log(`   • Avg summary length: ${avgSummaryLength.toFixed(0)} chars`);
  console.log();

  // Calculate metrics
  const metricResults: MetricResult[] = evalResults.queryResults.map(qr => {
    return calculateMetrics(
      qr.results,
      {
        query: qr.query,
        expectedUrls: qr.expectedUrls,
        relevance: qr.relevance,
      },
      10
    );
  });

  const aggregated = aggregateMetrics(metricResults);

  // Print aggregate metrics
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📈 AGGREGATE METRICS');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  console.log(`   Average Precision@10:  ${formatPercent(aggregated.avgPrecision)}`);
  console.log(`   Average Recall@10:     ${formatPercent(aggregated.avgRecall)}`);
  console.log(`   Average MRR:           ${formatScore(aggregated.avgMRR)}`);
  console.log(`   Average NDCG:          ${formatScore(aggregated.avgNDCG)}`);
  console.log(`   Average Similarity:    ${formatScore(aggregated.avgSimilarity)}`);
  console.log();

  // Quality assessment
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🎯 QUALITY ASSESSMENT');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const thresholds = {
    precision: 0.30,
    recall: 0.50,
    mrr: 0.50,
    ndcg: 0.60,
  };

  const checks = [
    { name: 'Precision@10', value: aggregated.avgPrecision, threshold: thresholds.precision },
    { name: 'Recall@10', value: aggregated.avgRecall, threshold: thresholds.recall },
    { name: 'MRR', value: aggregated.avgMRR, threshold: thresholds.mrr },
    { name: 'NDCG', value: aggregated.avgNDCG, threshold: thresholds.ndcg },
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

  // Print detailed results for failed queries
  const failedQueries = evalResults.queryResults.filter((_qr, idx) => {
    const metric = metricResults[idx];
    return metric.mrr < 1.0 || metric.ndcg < 0.9;
  });

  if (failedQueries.length > 0) {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('⚠️  PROBLEMATIC QUERIES');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    failedQueries.forEach((qr, idx) => {
      const metric = metricResults[evalResults.queryResults.indexOf(qr)];
      console.log(`${idx + 1}. "${qr.query}"`);
      console.log(`   MRR: ${formatScore(metric.mrr)} | NDCG: ${formatScore(metric.ndcg)}`);
      console.log(`   Top 3 results:`);
      qr.results.slice(0, 3).forEach((r, i) => {
        const isExpected = qr.expectedUrls.includes(r.url);
        const marker = isExpected ? '✓' : '✗';
        console.log(`   ${i + 1}. [${formatScore(r.similarity)}] ${marker} ${r.title.substring(0, 50)}`);
      });
      console.log();
    });
  }
}

// Run the eval
runChromeEval();
