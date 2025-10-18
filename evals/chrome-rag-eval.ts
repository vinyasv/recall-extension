/**
 * Chrome RAG Evaluation Runner
 *
 * Uses Puppeteer to:
 * 1. Launch Chrome with the extension loaded
 * 2. Index required pages
 * 3. Query the RAG system via the extension
 * 4. Evaluate responses
 *
 * Usage:
 *   npm run eval:rag:chrome
 *   npm run eval:rag:chrome -- --filter=factual
 */

import puppeteer, { type Browser, type Page } from 'puppeteer';
import path from 'path';
import { fileURLToPath } from 'url';
import { RAG_EVAL_DATASET, type RAGTestCase } from './rag-eval-dataset.js';
import { evaluateRAGTestCase, aggregateMetrics, type RAGEvalResult } from './rag-eval-metrics.js';
import * as fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
  headless?: boolean;
} {
  const args = process.argv.slice(2);
  const parsed: any = { headless: false }; // Default to visible for debugging

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith('--')) {
      const [key, value] = arg.substring(2).split('=');
      if (key === 'headless') {
        parsed[key] = value !== 'false';
      } else {
        parsed[key] = value || true;
      }
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
 * Launch Chrome with extension loaded
 */
async function launchChromeWithExtension(_headless: boolean = false): Promise<Browser> {
  const extensionPath = path.resolve(__dirname, '../dist');

  console.log(`${colors.dim}Extension path: ${extensionPath}${colors.reset}`);

  const browser = await puppeteer.launch({
    headless: false, // Extensions don't work in headless mode
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`,
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-web-security', // For easier debugging
      '--window-position=-2400,-2400', // Move window off-screen
      '--window-size=1,1', // Minimize window size
    ],
    // Use Chrome instead of Chromium if available
    executablePath: process.env.CHROME_PATH || undefined,
  });

  console.log(`${colors.green}✓ Chrome launched with extension${colors.reset}\n`);

  return browser;
}

/**
 * Get extension ID from loaded extension
 */
async function getExtensionId(browser: Browser): Promise<string> {
  // Wait a bit for extension to initialize
  await new Promise(resolve => setTimeout(resolve, 2000));

  const targets = await browser.targets();
  const extensionTarget = targets.find(
    target => target.type() === 'service_worker' && target.url().includes('chrome-extension://')
  );

  if (!extensionTarget) {
    throw new Error('Extension service worker not found. Make sure extension is loaded.');
  }

  const extensionId = extensionTarget.url().split('/')[2];
  console.log(`${colors.green}✓ Found extension${colors.reset}`);
  console.log(`${colors.dim}  Extension ID: ${extensionId}${colors.reset}\n`);

  return extensionId;
}

/**
 * Index required pages for test cases
 * Uses direct content extraction instead of relying on TabMonitor
 */
async function indexRequiredPages(browser: Browser, testCases: RAGTestCase[]): Promise<void> {
  const pagesToIndex = new Set<string>();

  // Collect all unique pages to index
  for (const testCase of testCases) {
    if (testCase.requiredPages) {
      for (const reqPage of testCase.requiredPages) {
        pagesToIndex.add(reqPage.url);
      }
    }
  }

  if (pagesToIndex.size === 0) {
    console.log(`${colors.yellow}⚠ No pages to index${colors.reset}\n`);
    return;
  }

  console.log(`${colors.bright}Indexing ${pagesToIndex.size} pages manually...${colors.reset}`);

  // Get eval bridge page for sending messages
  const pages = await browser.pages();
  const evalPage = pages.find(p => p.url().includes('eval-bridge'));

  if (!evalPage) {
    console.error(`${colors.red}✗ Eval bridge page not found${colors.reset}`);
    return;
  }

  for (const url of Array.from(pagesToIndex)) {
    console.log(`${colors.dim}  Indexing: ${url}${colors.reset}`);

    try {
      // Open page in a new tab
      const indexPage = await browser.newPage();
      await indexPage.goto(url, { waitUntil: 'networkidle0', timeout: 15000 });

      // Extract content from the page
      const content = await indexPage.evaluate(() => {
        return {
          title: document.title,
          url: window.location.href,
          body: document.body.innerText
        };
      });

      // Send to extension for manual indexing via eval bridge
      const indexed = await evalPage.evaluate(async (pageData: any) => {
        return new Promise((resolve) => {
          // @ts-ignore
          chrome.runtime.sendMessage(
            {
              type: 'MANUAL_INDEX_PAGE',
              pageData: {
                url: pageData.url,
                title: pageData.title,
                content: pageData.body,
              }
            },
            (response: any) => {
              resolve(response?.success || false);
            }
          );
        });
      }, content);

      if (indexed) {
        console.log(`${colors.green}  ✓ Indexed: ${content.title}${colors.reset}`);
      } else {
        console.log(`${colors.yellow}  ⚠ Failed to index: ${url}${colors.reset}`);
      }

      // Close the tab
      await indexPage.close();

      // Small delay between pages
      await new Promise(resolve => setTimeout(resolve, 1000));
    } catch (error) {
      console.error(`${colors.red}  ✗ Error indexing: ${url}${colors.reset}`);
      console.error(`${colors.dim}    ${error}${colors.reset}`);
    }
  }

  console.log(`${colors.green}✓ Indexing complete${colors.reset}\n`);

  // Wait for background indexing pipeline to complete (extraction, summarization, embedding)
  console.log(`${colors.dim}Waiting for background processing (embeddings generation)...${colors.reset}`);
  await new Promise(resolve => setTimeout(resolve, 10000)); // Increased to 10 seconds

  // Check how many pages were actually indexed
  const indexedCount = await checkIndexedPagesCount(browser);
  console.log(`${colors.cyan}📊 Pages in database: ${indexedCount}${colors.reset}\n`);
}

/**
 * Check how many pages are in the database
 */
async function checkIndexedPagesCount(browser: Browser): Promise<number> {
  const pages = await browser.pages();
  const evalPage = pages.find(p => p.url().includes('eval-bridge'));

  if (!evalPage) {
    return 0;
  }

  const count = await evalPage.evaluate(async () => {
    return new Promise<number>((resolve) => {
      // @ts-ignore
      chrome.runtime.sendMessage({ type: 'GET_DB_STATS' }, (response: any) => {
        resolve(response?.stats?.totalPages || 0);
      });
    });
  });

  return count;
}

/**
 * Query RAG via extension using eval bridge page
 */
async function queryRAG(
  page: Page,
  question: string
): Promise<{
  answer: string;
  sources: any[];
  timings: { total: number; search: number; generation: number };
}> {
  // Call the window.queryRAG function exposed by eval-bridge.ts
  const result = await page.evaluate(
    async (q: string) => {
      // @ts-ignore - window.queryRAG is defined in eval-bridge.ts
      return await window.queryRAG(q, { topK: 5, minSimilarity: 0.3 });
    },
    question
  );

  return result as any;
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
  output += `${colors.dim}A: ${result.answer.substring(0, 200)}${result.answer.length > 200 ? '...' : ''}${colors.reset}\n\n`;

  output += `${colors.bright}Metrics:${colors.reset}\n`;
  output += `  Overall Score:      ${scoreColor}${(metrics.overallScore * 100).toFixed(1)}%${colors.reset}\n`;
  output += `  Source Relevance:   ${formatScore(metrics.sourceRelevanceScore)}\n`;
  output += `  Keyword Coverage:   ${formatScore(metrics.keywordCoverageScore)}\n`;
  output += `  Appropriateness:    ${formatScore(metrics.appropriatenessScore)}\n`;
  output += `  Response Time:      ${formatScore(metrics.responseTimeScore)} (${result.timings.total}ms)\n`;

  output += `\n${colors.bright}Details:${colors.reset}\n`;
  output += `  Cited ${details.citedSources.length} source(s)\n`;
  if (details.matchedSources.length > 0) {
    output += `  ${colors.green}✓ Matched: ${details.matchedSources.join(', ')}${colors.reset}\n`;
  }
  if (details.foundKeywords.length > 0) {
    output += `  ${colors.green}✓ Keywords: ${details.foundKeywords.join(', ')}${colors.reset}\n`;
  }

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
 * Format aggregate metrics
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
async function runChromeEval() {
  const args = parseArgs();
  const testCases = filterTestCases(RAG_EVAL_DATASET, args.filter, args.difficulty);

  console.log(`${colors.bright}${colors.cyan}Chrome RAG Evaluation Runner${colors.reset}`);
  console.log(`${colors.dim}Running ${testCases.length} test cases in Chrome...${colors.reset}\n`);

  if (testCases.length === 0) {
    console.log(`${colors.red}No test cases found matching filters.${colors.reset}`);
    return;
  }

  let browser: Browser | null = null;

  try {
    // Launch Chrome with extension
    browser = await launchChromeWithExtension(args.headless);
    const page = await browser.newPage();

    // Get extension ID
    const extensionId = await getExtensionId(browser);

    // Navigate to eval bridge page (extension page that can access chrome.runtime)
    const evalBridgeUrl = `chrome-extension://${extensionId}/src/ui/eval-bridge.html`;
    console.log(`${colors.dim}Navigating to eval bridge: ${evalBridgeUrl}${colors.reset}\n`);
    await page.goto(evalBridgeUrl, { waitUntil: 'networkidle0' });

    // Wait for eval bridge to be ready
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Index required pages (in separate tabs)
    await indexRequiredPages(browser, testCases);

    // Run each test case
    const results: RAGEvalResult[] = [];

    for (const testCase of testCases) {
      console.log(`${colors.bright}Running: ${testCase.id}${colors.reset}`);
      console.log(`${colors.dim}Q: ${testCase.question}${colors.reset}`);

      try {
        // Query RAG system from page context
        const { answer, sources, timings } = await queryRAG(page, testCase.question);

        // Evaluate result
        const result = evaluateRAGTestCase(testCase, answer, sources, timings);
        results.push(result);

        // Display result
        console.log(formatResult(result));
      } catch (error) {
        console.error(`${colors.red}✗ Error running test ${testCase.id}:${colors.reset}`, error);
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
        aggregated,
      };

      fs.writeFileSync(outputPath, JSON.stringify(reportData, null, 2));
      console.log(`\n${colors.green}✓ Results saved to: ${outputPath}${colors.reset}`);
    }

    // Exit with appropriate code
    const exitCode = aggregated.passRate >= 0.7 ? 0 : 1;

    // Keep browser open for a bit to review results
    console.log(`\n${colors.dim}Keeping browser open for 5 seconds...${colors.reset}`);
    await new Promise(resolve => setTimeout(resolve, 5000));

    await browser.close();
    process.exit(exitCode);

  } catch (error) {
    console.error(`${colors.red}Fatal error:${colors.reset}`, error);
    if (browser) {
      await browser.close();
    }
    process.exit(1);
  }
}

// Run if called directly
const isMainModule = import.meta.url === `file://${process.argv[1]}`;
if (isMainModule) {
  runChromeEval();
}

export { runChromeEval };
