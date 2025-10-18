/**
 * RAG Evaluation Runner
 *
 * Runs RAG evaluation tests and generates a report.
 *
 * Usage:
 *   npm run eval:rag
 *   npm run eval:rag -- --filter=factual
 *   npm run eval:rag -- --difficulty=easy
 *   npm run eval:rag -- --output=results.json
 */

import { RAG_EVAL_DATASET, type RAGTestCase } from './rag-eval-dataset';
import { evaluateRAGTestCase, aggregateMetrics, type RAGEvalResult } from './rag-eval-metrics';
import * as fs from 'fs';
import * as path from 'path';

// Colors for terminal output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
};

/**
 * Parse command line arguments
 */
function parseArgs(): {
  filter?: string;
  difficulty?: 'easy' | 'medium' | 'hard';
  output?: string;
} {
  const args = process.argv.slice(2);
  const parsed: any = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith('--')) {
      const [key, value] = arg.substring(2).split('=');
      parsed[key] = value || true;
    }
  }

  return parsed;
}

/**
 * Filter test cases based on arguments
 */
function filterTestCases(
  testCases: RAGTestCase[],
  filter?: string,
  difficulty?: string
): RAGTestCase[] {
  let filtered = testCases;

  if (filter) {
    filtered = filtered.filter(tc => tc.category === filter);
  }

  if (difficulty) {
    filtered = filtered.filter(tc => tc.difficulty === difficulty);
  }

  return filtered;
}

/**
 * Run RAG query via Chrome extension
 * Requires the extension to be loaded in Chrome
 */
async function runRAGQuery(_question: string): Promise<{
  answer: string;
  sources: any[];
  timings: { total: number; search: number; generation: number };
}> {
  // This function would need to communicate with the Chrome extension
  // For now, we'll simulate this - in a real implementation, you'd use:
  // 1. Chrome DevTools Protocol (CDP)
  // 2. Puppeteer with the extension loaded
  // 3. Or manually via the extension's UI

  console.log(`${colors.yellow}Note: This is a simulation. To run real evals:${colors.reset}`);
  console.log(`${colors.dim}1. Load the extension in Chrome${colors.reset}`);
  console.log(`${colors.dim}2. Use Chrome DevTools Protocol to send RAG_QUERY messages${colors.reset}`);
  console.log(`${colors.dim}3. Or integrate with Puppeteer for automation${colors.reset}\n`);

  // Simulated response for demonstration
  return {
    answer: "This is a simulated answer. Real implementation would query the extension.",
    sources: [],
    timings: { total: 1500, search: 500, generation: 1000 }
  };
}

/**
 * Format evaluation result for display
 */
function formatResult(result: RAGEvalResult): string {
  const { metrics, details } = result;
  const scoreColor = metrics.overallScore >= 0.7 ? colors.green : metrics.overallScore >= 0.4 ? colors.yellow : colors.red;

  let output = '';
  output += `\n${colors.bright}${colors.blue}Test: ${result.testCaseId}${colors.reset}\n`;
  output += `${colors.dim}Q: ${result.question}${colors.reset}\n`;
  output += `${colors.dim}A: ${result.answer.substring(0, 150)}...${colors.reset}\n\n`;

  output += `${colors.bright}Metrics:${colors.reset}\n`;
  output += `  Overall Score:      ${scoreColor}${(metrics.overallScore * 100).toFixed(1)}%${colors.reset}\n`;
  output += `  Source Relevance:   ${formatScore(metrics.sourceRelevanceScore)}\n`;
  output += `  Keyword Coverage:   ${formatScore(metrics.keywordCoverageScore)}\n`;
  output += `  Appropriateness:    ${formatScore(metrics.appropriatenessScore)}\n`;
  output += `  Response Time:      ${formatScore(metrics.responseTimeScore)} (${result.timings.total}ms)\n`;

  output += `\n${colors.bright}Details:${colors.reset}\n`;
  output += `  Expected Sources: ${details.expectedSources.length > 0 ? details.expectedSources.join(', ') : 'N/A'}\n`;
  output += `  Cited Sources:    ${details.citedSources.length > 0 ? details.citedSources.join(', ') : 'None'}\n`;
  output += `  Matched Sources:  ${details.matchedSources.length > 0 ? details.matchedSources.join(', ') : 'None'}\n`;
  output += `  Expected Keywords: ${details.expectedKeywords.join(', ') || 'N/A'}\n`;
  output += `  Found Keywords:    ${details.foundKeywords.join(', ') || 'None'}\n`;

  return output;
}

/**
 * Format a score with color
 */
function formatScore(score: number): string {
  const percentage = (score * 100).toFixed(1);
  const color = score >= 0.7 ? colors.green : score >= 0.4 ? colors.yellow : colors.red;
  return `${color}${percentage}%${colors.reset}`;
}

/**
 * Format aggregate metrics for display
 */
function formatAggregateMetrics(metrics: ReturnType<typeof aggregateMetrics>): string {
  const passColor = metrics.passRate >= 0.7 ? colors.green : metrics.passRate >= 0.4 ? colors.yellow : colors.red;

  let output = '';
  output += `\n${colors.bright}${colors.magenta}=== AGGREGATE METRICS ===${colors.reset}\n\n`;
  output += `${colors.bright}Overall Performance:${colors.reset}\n`;
  output += `  Average Score:      ${formatScore(metrics.avgOverallScore)}\n`;
  output += `  Pass Rate:          ${passColor}${(metrics.passRate * 100).toFixed(1)}%${colors.reset} (${metrics.passedTests}/${metrics.totalTests} passed)\n`;

  output += `\n${colors.bright}Metric Breakdown:${colors.reset}\n`;
  output += `  Source Relevance:   ${formatScore(metrics.avgSourceRelevance)}\n`;
  output += `  Keyword Coverage:   ${formatScore(metrics.avgKeywordCoverage)}\n`;
  output += `  Appropriateness:    ${formatScore(metrics.avgAppropriateness)}\n`;
  output += `  Response Time:      ${formatScore(metrics.avgResponseTime)}\n`;

  return output;
}

/**
 * Main eval runner
 */
async function runEval() {
  const args = parseArgs();
  const testCases = filterTestCases(RAG_EVAL_DATASET, args.filter, args.difficulty);

  console.log(`${colors.bright}${colors.cyan}RAG Evaluation Runner${colors.reset}`);
  console.log(`${colors.dim}Running ${testCases.length} test cases...${colors.reset}\n`);

  if (testCases.length === 0) {
    console.log(`${colors.red}No test cases found matching filters.${colors.reset}`);
    return;
  }

  const results: RAGEvalResult[] = [];

  // Run each test case
  for (const testCase of testCases) {
    console.log(`${colors.dim}Running: ${testCase.id}...${colors.reset}`);

    try {
      // Query RAG system
      const { answer, sources, timings } = await runRAGQuery(testCase.question);

      // Evaluate result
      const result = evaluateRAGTestCase(testCase, answer, sources, timings);
      results.push(result);

      // Display result
      console.log(formatResult(result));
    } catch (error) {
      console.error(`${colors.red}Error running test ${testCase.id}:${colors.reset}`, error);
    }
  }

  // Aggregate and display overall metrics
  const aggregated = aggregateMetrics(results);
  console.log(formatAggregateMetrics(aggregated));

  // Save results to file if requested
  if (args.output) {
    const outputPath = path.resolve(process.cwd(), args.output);
    const reportData = {
      timestamp: new Date().toISOString(),
      filters: args,
      results,
      aggregated
    };

    fs.writeFileSync(outputPath, JSON.stringify(reportData, null, 2));
    console.log(`\n${colors.green}Results saved to: ${outputPath}${colors.reset}`);
  }

  // Exit with appropriate code
  process.exit(aggregated.passRate >= 0.7 ? 0 : 1);
}

// Run if called directly (ESM version)
const isMainModule = import.meta.url === `file://${process.argv[1]}`;
if (isMainModule) {
  runEval().catch(error => {
    console.error(`${colors.red}Fatal error:${colors.reset}`, error);
    process.exit(1);
  });
}

export { runEval };
