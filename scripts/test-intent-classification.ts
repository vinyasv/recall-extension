/**
 * Comprehensive test suite for hybrid intent classification
 * Tests both regex and LLM-based classifiers with diverse queries
 */

import { QueryIntentClassifier } from '../src/lib/rag/QueryIntentClassifier';
import { LLMIntentClassifier } from '../src/lib/rag/LLMIntentClassifier';
import { IntentClassificationService } from '../src/lib/rag/IntentClassificationService';
import type { QueryIntent } from '../src/lib/rag/types';

// Test queries organized by expected intent
const TEST_QUERIES = {
  factual: [
    'What is machine learning?',
    'Who invented the internet?',
    'When was JavaScript created?',
    'Where is the Eiffel Tower?',
    'Why is the sky blue?',
    'Define recursion',
    'Explain quantum computing',
    'Tell me about climate change',
    'What does REST API mean?',
    'Information about neural networks',
  ],
  comparison: [
    'React vs Vue',
    'Compare Python and JavaScript',
    'Difference between AI and ML',
    'Which is better: TypeScript or JavaScript?',
    'Pros and cons of microservices',
    'Angular versus React performance',
    'Which framework should I use?',
    'Best practices: REST vs GraphQL',
    'Kubernetes vs Docker Swarm',
    'Advantages of PostgreSQL over MySQL',
  ],
  howto: [
    'How to install Docker?',
    'Steps to deploy a website',
    'Tutorial for React hooks',
    'How do I configure Git?',
    'Show me how to use TypeScript',
    'Guide to building REST APIs',
    'How can I learn Python?',
    'Setup instructions for Node.js',
    'Way to implement OAuth',
    'Process for deploying to AWS',
  ],
  navigation: [
    'Find that article about climate change',
    'Show me the page about machine learning I visited yesterday',
    'That site about TypeScript tutorials',
    'Where did I see the React documentation?',
    'Which page had the Docker installation guide?',
    'The blog post I read last week about AI',
    'That website I bookmarked about GraphQL',
    'Find the GitHub repo I visited',
    'The article I saw recently about Kubernetes',
    'That page about web performance I remember',
  ],
  general: [
    'machine learning applications',
    'latest tech trends',
    'interesting articles about space',
    'web development resources',
    'TypeScript',
    'React patterns',
    'database optimization',
    'cloud computing',
    'cybersecurity news',
    'API design',
  ],
};

// Edge cases and challenging queries
const EDGE_CASES = {
  'multi-word entities': 'What is React Native?',
  'implicit navigation': 'TypeScript documentation',
  'ambiguous intent': 'React',
  'question vs keyword': 'best pizza places',
  'temporal navigation': 'yesterday climate article',
  'compound query': 'How to compare React vs Vue and choose the best?',
  'very short query': 'API',
  'very long query':
    'I am looking for that comprehensive article I read about machine learning algorithms that discussed both supervised and unsupervised learning techniques',
};

interface TestResult {
  query: string;
  expectedIntent: string;
  predictedIntent: string;
  confidence: number;
  correct: boolean;
  method?: string;
  latency?: number;
}

/**
 * Run regex classifier tests
 */
function testRegexClassifier(): void {
  console.log('\n=== REGEX CLASSIFIER TESTS ===\n');

  const regexClassifier = new QueryIntentClassifier();
  const results: TestResult[] = [];

  for (const [expectedIntent, queries] of Object.entries(TEST_QUERIES)) {
    for (const query of queries) {
      const startTime = Date.now();
      const result = regexClassifier.classifyQuery(query);
      const latency = Date.now() - startTime;

      const testResult: TestResult = {
        query,
        expectedIntent,
        predictedIntent: result.type,
        confidence: result.confidence,
        correct: result.type === expectedIntent,
        latency,
      };

      results.push(testResult);

      const status = testResult.correct ? '✅' : '❌';
      console.log(
        `${status} ${query.substring(0, 50).padEnd(52)} | Expected: ${expectedIntent.padEnd(10)} | Got: ${result.type.padEnd(10)} | Conf: ${result.confidence.toFixed(2)} | ${latency}ms`
      );
    }
  }

  // Calculate metrics
  const totalTests = results.length;
  const correctTests = results.filter((r) => r.correct).length;
  const accuracy = (correctTests / totalTests) * 100;
  const avgConfidence =
    results.reduce((sum, r) => sum + r.confidence, 0) / results.length;
  const avgLatency = results.reduce((sum, r) => sum + (r.latency || 0), 0) / results.length;

  console.log('\n=== REGEX CLASSIFIER METRICS ===');
  console.log(`Total Tests: ${totalTests}`);
  console.log(`Correct: ${correctTests}`);
  console.log(`Accuracy: ${accuracy.toFixed(2)}%`);
  console.log(`Avg Confidence: ${avgConfidence.toFixed(2)}`);
  console.log(`Avg Latency: ${avgLatency.toFixed(2)}ms`);

  // Show confusion matrix
  console.log('\n=== CONFUSION MATRIX ===');
  const intents = Object.keys(TEST_QUERIES);
  const matrix: Record<string, Record<string, number>> = {};

  for (const intent of intents) {
    matrix[intent] = {};
    for (const predictedIntent of intents) {
      matrix[intent][predictedIntent] = 0;
    }
  }

  for (const result of results) {
    if (matrix[result.expectedIntent]) {
      matrix[result.expectedIntent][result.predictedIntent] =
        (matrix[result.expectedIntent][result.predictedIntent] || 0) + 1;
    }
  }

  console.log('\n        ', intents.map((i) => i.substring(0, 10).padEnd(10)).join(' '));
  for (const expected of intents) {
    const row = intents.map((predicted) => String(matrix[expected][predicted]).padEnd(10));
    console.log(`${expected.padEnd(10)}`, row.join(' '));
  }

  // Test edge cases
  console.log('\n=== EDGE CASES ===');
  for (const [name, query] of Object.entries(EDGE_CASES)) {
    const result = regexClassifier.classifyQuery(query);
    console.log(
      `${name.padEnd(25)}: ${query.substring(0, 40).padEnd(42)} → ${result.type.padEnd(10)} (conf: ${result.confidence.toFixed(2)})`
    );
  }
}

/**
 * Run hybrid classifier tests (requires Chrome environment)
 */
async function testHybridClassifier(): Promise<void> {
  console.log('\n\n=== HYBRID CLASSIFIER TESTS ===\n');

  const hybridService = new IntentClassificationService();

  try {
    await hybridService.initialize();
  } catch (error) {
    console.log('❌ Cannot test hybrid classifier: Chrome Prompt API not available');
    console.log('   (This is expected in Node.js environment)');
    return;
  }

  const results: TestResult[] = [];
  let regexUsed = 0;
  let llmUsed = 0;

  for (const [expectedIntent, queries] of Object.entries(TEST_QUERIES)) {
    // Test first 3 queries from each category
    for (const query of queries.slice(0, 3)) {
      try {
        const result = await hybridService.classify(query);

        const testResult: TestResult = {
          query,
          expectedIntent,
          predictedIntent: result.type,
          confidence: result.confidence,
          correct: result.type === expectedIntent,
          method: result.method,
          latency: result.latency,
        };

        results.push(testResult);

        if (result.method === 'regex') regexUsed++;
        if (result.method === 'llm') llmUsed++;

        const status = testResult.correct ? '✅' : '❌';
        console.log(
          `${status} ${query.substring(0, 40).padEnd(42)} | ${result.method.padEnd(5)} | ${result.type.padEnd(10)} | Conf: ${result.confidence.toFixed(2)} | ${result.latency}ms`
        );
      } catch (error) {
        console.log(`❌ Failed to classify: ${query}`);
      }
    }
  }

  // Calculate metrics
  const totalTests = results.length;
  const correctTests = results.filter((r) => r.correct).length;
  const accuracy = (correctTests / totalTests) * 100;
  const avgLatency = results.reduce((sum, r) => sum + (r.latency || 0), 0) / results.length;

  console.log('\n=== HYBRID CLASSIFIER METRICS ===');
  console.log(`Total Tests: ${totalTests}`);
  console.log(`Correct: ${correctTests}`);
  console.log(`Accuracy: ${accuracy.toFixed(2)}%`);
  console.log(`Avg Latency: ${avgLatency.toFixed(2)}ms`);
  console.log(`Regex Used: ${regexUsed} (${((regexUsed / totalTests) * 100).toFixed(1)}%)`);
  console.log(`LLM Used: ${llmUsed} (${((llmUsed / totalTests) * 100).toFixed(1)}%)`);

  // Show statistics
  const stats = hybridService.getStats();
  console.log('\n=== HYBRID SERVICE STATS ===');
  console.log(`LLM Available: ${stats.llmAvailable}`);
  console.log(`Regex Percentage: ${stats.regexPercentage.toFixed(1)}%`);
  console.log(`LLM Percentage: ${stats.llmPercentage.toFixed(1)}%`);
  console.log(`LLM Failure Rate: ${stats.llmFailureRate.toFixed(1)}%`);
}

/**
 * Run performance benchmarks
 */
function benchmarkPerformance(): void {
  console.log('\n\n=== PERFORMANCE BENCHMARK ===\n');

  const regexClassifier = new QueryIntentClassifier();
  const iterations = 1000;
  const testQuery = 'What is machine learning and how does it work?';

  console.log(`Running ${iterations} iterations...`);

  const startTime = Date.now();
  for (let i = 0; i < iterations; i++) {
    regexClassifier.classifyQuery(testQuery);
  }
  const endTime = Date.now();

  const totalTime = endTime - startTime;
  const avgTime = totalTime / iterations;

  console.log(`Total Time: ${totalTime}ms`);
  console.log(`Average Time per Query: ${avgTime.toFixed(3)}ms`);
  console.log(`Throughput: ${(iterations / (totalTime / 1000)).toFixed(0)} queries/sec`);
}

/**
 * Main test runner
 */
async function main() {
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║       HYBRID INTENT CLASSIFICATION TEST SUITE                 ║');
  console.log('╚════════════════════════════════════════════════════════════════╝');

  // Test regex classifier
  testRegexClassifier();

  // Performance benchmark
  benchmarkPerformance();

  // Test hybrid classifier (only works in Chrome environment)
  await testHybridClassifier();

  console.log('\n✅ All tests completed!\n');
}

// Run tests
main().catch((error) => {
  console.error('❌ Test suite failed:', error);
  process.exit(1);
});
