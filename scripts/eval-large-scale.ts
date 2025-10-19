/**
 * Large-Scale Search Evaluation (100+ pages)
 * Comprehensive end-to-end testing with realistic corpus
 */

import { embeddingService } from '../src/lib/embeddings/EmbeddingService';
import { hybridSearch } from '../src/lib/search/HybridSearch';
import { vectorStore } from '../src/lib/storage/VectorStore';
import type { PageRecord, PageMetadata, Passage } from '../src/lib/storage/types';
import { generateTestCorpus, type CorpusPage } from './eval-corpus-generator';

interface TestQuery {
  id: string;
  query: string;
  expectedPageIds: string[];  // Relevant page IDs (in order of relevance)
  expectedTags?: string[];     // Pages with these tags should be relevant
  category?: string;           // Expected category
  description: string;
}

interface EvaluationMetrics {
  mrr: number;              // Mean Reciprocal Rank
  precision5: number;       // Precision@5
  precision10: number;      // Precision@10
  recall5: number;          // Recall@5
  recall10: number;         // Recall@10
  ndcg5: number;           // Normalized Discounted Cumulative Gain @5
  avgLatency: number;      // Average query latency (ms)
  passageMatchRate: number; // % of queries finding passage matches
}

async function runLargeScaleEvaluation() {
  console.log('🚀 Large-Scale Search Evaluation\n');
  console.log('Testing passage-first search architecture with 100+ pages\n');
  console.log('═'.repeat(80));

  // Initialize
  await embeddingService.initialize();
  console.log('\n✅ Embedding service initialized');

  // Generate corpus
  console.log('📚 Generating test corpus...');
  const corpus = generateTestCorpus();
  console.log(`✅ Generated ${corpus.length} pages`);

  // Convert corpus to PageRecords
  console.log('\n🔄 Building page records with embeddings...');
  const pages: PageRecord[] = [];

  let processed = 0;
  for (const corpusPage of corpus) {
    const passagesWithEmbeddings: Passage[] = [];

    for (let i = 0; i < corpusPage.passages.length; i++) {
      const p = corpusPage.passages[i];
      const embedding = await embeddingService.generateEmbedding(p.text);
      passagesWithEmbeddings.push({
        id: `${corpusPage.id}-p${i}`,
        text: p.text,
        wordCount: p.text.split(/\s+/).length,
        position: i,
        quality: p.quality,
        embedding
      });
    }

    // Generate page embedding from top 5 passages
    const topPassages = passagesWithEmbeddings
      .filter(p => p.quality > 0.3)
      .sort((a, b) => b.quality - a.quality)
      .slice(0, 5);

    const pageEmbeddingText = [corpusPage.title, ...topPassages.map(p => p.text)].join('. ');
    const pageEmbedding = await embeddingService.generateEmbedding(pageEmbeddingText);

    // Summary from top 2 passages (fallback mode)
    const summary = passagesWithEmbeddings
      .slice(0, 2)
      .map(p => p.text)
      .join(' ')
      .substring(0, 300);

    pages.push({
      id: corpusPage.id,
      url: corpusPage.url,
      title: corpusPage.title,
      content: passagesWithEmbeddings.map(p => p.text).join('\n'),
      summary,
      passages: passagesWithEmbeddings,
      embedding: pageEmbedding,
      timestamp: Date.now() - processed * 1000,
      dwellTime: 60 + Math.random() * 300,
      lastAccessed: 0
    });

    processed++;
    if (processed % 10 === 0) {
      process.stdout.write(`\r  Progress: ${processed}/${corpus.length} pages`);
    }
  }
  console.log(`\n✅ Created ${pages.length} page records with embeddings\n`);

  // Set up vectorStore mock (for both VectorSearch and KeywordSearch)
  (vectorStore as any).getAllPageMetadata = async (): Promise<PageMetadata[]> => {
    return pages.map(p => ({
      id: p.id,
      url: p.url,
      title: p.title,
      embedding: p.embedding,
      timestamp: p.timestamp,
      dwellTime: p.dwellTime,
      lastAccessed: p.lastAccessed
    }));
  };
  (vectorStore as any).getAllPages = async (): Promise<PageRecord[]> => {
    return pages; // KeywordSearch needs this for hybrid mode
  };
  (vectorStore as any).getPage = async (id: string): Promise<PageRecord | null> => {
    return pages.find(p => p.id === id) || null;
  };

  // Define comprehensive test queries
  const testQueries: TestQuery[] = [
    // React/Frontend queries
    {
      id: 'q1',
      query: 'React hooks useState useEffect',
      expectedPageIds: ['web-1'],
      expectedTags: ['react', 'hooks'],
      category: 'web-dev',
      description: 'Specific React hooks query'
    },
    {
      id: 'q2',
      query: 'CSS flexbox layout centering',
      expectedPageIds: ['web-2'],
      expectedTags: ['css', 'flexbox'],
      category: 'web-dev',
      description: 'CSS layout query'
    },
    {
      id: 'q3',
      query: 'Next.js server components app router',
      expectedPageIds: ['web-3'],
      expectedTags: ['nextjs', 'react'],
      category: 'web-dev',
      description: 'Next.js specific query'
    },
    {
      id: 'q4',
      query: 'Tailwind CSS utility classes responsive design',
      expectedPageIds: ['web-4'],
      expectedTags: ['tailwind', 'css'],
      category: 'web-dev',
      description: 'Tailwind query'
    },
    {
      id: 'q5',
      query: 'TypeScript interfaces vs types',
      expectedPageIds: ['web-5'],
      expectedTags: ['typescript'],
      category: 'web-dev',
      description: 'TypeScript query'
    },

    // DevOps queries
    {
      id: 'q6',
      query: 'Docker container networking bridge',
      expectedPageIds: ['devops-1'],
      expectedTags: ['docker', 'networking'],
      category: 'devops',
      description: 'Docker networking query'
    },
    {
      id: 'q7',
      query: 'Kubernetes pods containers lifecycle',
      expectedPageIds: ['devops-2'],
      expectedTags: ['kubernetes', 'pods'],
      category: 'devops',
      description: 'Kubernetes pods query'
    },
    {
      id: 'q8',
      query: 'Terraform infrastructure as code HCL',
      expectedPageIds: ['devops-3'],
      expectedTags: ['terraform', 'iac'],
      category: 'devops',
      description: 'Terraform query'
    },
    {
      id: 'q9',
      query: 'GitHub Actions CI/CD workflows',
      expectedPageIds: ['devops-4'],
      expectedTags: ['github', 'ci-cd'],
      category: 'devops',
      description: 'GitHub Actions query'
    },
    {
      id: 'q10',
      query: 'Nginx reverse proxy load balancing',
      expectedPageIds: ['devops-5'],
      expectedTags: ['nginx', 'proxy'],
      category: 'devops',
      description: 'Nginx proxy query'
    },

    // Database queries
    {
      id: 'q11',
      query: 'PostgreSQL indexing B-tree performance',
      expectedPageIds: ['data-1'],
      expectedTags: ['postgresql', 'indexing'],
      category: 'database',
      description: 'PostgreSQL indexing query'
    },
    {
      id: 'q12',
      query: 'Redis data structures sorted sets',
      expectedPageIds: ['data-2'],
      expectedTags: ['redis', 'data-structures'],
      category: 'database',
      description: 'Redis data structures query'
    },
    {
      id: 'q13',
      query: 'MongoDB aggregation pipeline stages',
      expectedPageIds: ['data-3'],
      expectedTags: ['mongodb', 'aggregation'],
      category: 'database',
      description: 'MongoDB aggregation query'
    },
    {
      id: 'q14',
      query: 'Apache Spark RDD transformations actions',
      expectedPageIds: ['data-4'],
      expectedTags: ['spark', 'distributed'],
      category: 'database',
      description: 'Spark RDD query'
    },

    // Security queries
    {
      id: 'q15',
      query: 'JWT authentication tokens stateless',
      expectedPageIds: ['sec-1'],
      expectedTags: ['jwt', 'authentication'],
      category: 'security',
      description: 'JWT authentication query'
    },
    {
      id: 'q16',
      query: 'OWASP security vulnerabilities injection',
      expectedPageIds: ['sec-2'],
      expectedTags: ['owasp', 'security'],
      category: 'security',
      description: 'OWASP security query'
    },
    {
      id: 'q17',
      query: 'OAuth 2.0 authorization access tokens',
      expectedPageIds: ['sec-3'],
      expectedTags: ['oauth', 'authorization'],
      category: 'security',
      description: 'OAuth query'
    },

    // ML queries
    {
      id: 'q18',
      query: 'PyTorch tensors GPU operations',
      expectedPageIds: ['ml-1'],
      expectedTags: ['pytorch', 'tensors'],
      category: 'machine-learning',
      description: 'PyTorch tensors query'
    },
    {
      id: 'q19',
      query: 'sklearn ensemble methods random forest',
      expectedPageIds: ['ml-2'],
      expectedTags: ['sklearn', 'ensemble'],
      category: 'machine-learning',
      description: 'Sklearn ensemble query'
    },

    // Broad queries (multiple relevant results)
    {
      id: 'q20',
      query: 'container orchestration deployment',
      expectedPageIds: ['devops-2', 'devops-1'], // Kubernetes, Docker
      expectedTags: ['kubernetes', 'docker'],
      category: 'devops',
      description: 'Broad container query'
    },
    {
      id: 'q21',
      query: 'web framework server-side rendering',
      expectedPageIds: ['web-3'], // Next.js
      expectedTags: ['nextjs', 'react'],
      category: 'web-dev',
      description: 'Broad framework query'
    },
    {
      id: 'q22',
      query: 'database performance optimization',
      expectedPageIds: ['data-1', 'data-3', 'data-4'], // PostgreSQL, MongoDB, Spark
      expectedTags: ['postgresql', 'mongodb'],
      category: 'database',
      description: 'Broad database query'
    }
  ];

  console.log(`🔍 Running ${testQueries.length} test queries...\n`);
  console.log('═'.repeat(80));

  // Run evaluation
  const results: Array<{
    query: TestQuery;
    results: any[];
    latency: number;
    metrics: {
      mrr: number;
      precision5: number;
      precision10: number;
      recall5: number;
      recall10: number;
      ndcg5: number;
    };
  }> = [];

  for (const testQuery of testQueries) {
    const startTime = Date.now();
    const searchResults = await hybridSearch.search(testQuery.query, {
      mode: 'hybrid',  // Test HYBRID mode (semantic + keyword + RRF)
      k: 10
    });
    const latency = Date.now() - startTime;

    // Calculate metrics
    const metrics = calculateMetrics(searchResults, testQuery);

    results.push({
      query: testQuery,
      results: searchResults,
      latency,
      metrics
    });

    // Print result
    const topResult = searchResults[0];
    const isCorrect = topResult && testQuery.expectedPageIds.includes(topResult.page.id);
    const emoji = isCorrect ? '✅' : '❌';

    console.log(`\n${emoji} [${testQuery.id}] "${testQuery.query}"`);
    console.log(`   Description: ${testQuery.description}`);
    console.log(`   Top result: ${topResult?.page.title || 'N/A'} (${topResult?.page.id || 'N/A'})`);
    console.log(`   Expected: ${testQuery.expectedPageIds.join(', ')}`);
    console.log(`   MRR: ${metrics.mrr.toFixed(3)} | P@5: ${metrics.precision5.toFixed(3)} | NDCG@5: ${metrics.ndcg5.toFixed(3)} | Latency: ${latency}ms`);
  }

  console.log('\n' + '═'.repeat(80));
  console.log('\n📊 AGGREGATE METRICS\n');

  // Calculate aggregate metrics
  const aggregateMetrics = calculateAggregateMetrics(results);

  console.log(`Mean Reciprocal Rank (MRR):     ${aggregateMetrics.mrr.toFixed(3)}`);
  console.log(`  Target: > 0.7 | Status: ${aggregateMetrics.mrr > 0.7 ? '✅ PASS' : '❌ FAIL'}`);

  console.log(`\nPrecision@5:                    ${aggregateMetrics.precision5.toFixed(3)}`);
  console.log(`  Target: > 0.6 | Status: ${aggregateMetrics.precision5 > 0.6 ? '✅ PASS' : '⚠️  BELOW'}`);

  console.log(`\nPrecision@10:                   ${aggregateMetrics.precision10.toFixed(3)}`);
  console.log(`  Target: > 0.5 | Status: ${aggregateMetrics.precision10 > 0.5 ? '✅ PASS' : '⚠️  BELOW'}`);

  console.log(`\nRecall@5:                       ${aggregateMetrics.recall5.toFixed(3)}`);
  console.log(`  Target: > 0.5 | Status: ${aggregateMetrics.recall5 > 0.5 ? '✅ PASS' : '⚠️  BELOW'}`);

  console.log(`\nRecall@10:                      ${aggregateMetrics.recall10.toFixed(3)}`);
  console.log(`  Target: > 0.7 | Status: ${aggregateMetrics.recall10 > 0.7 ? '✅ PASS' : '⚠️  BELOW'}`);

  console.log(`\nNDCG@5:                         ${aggregateMetrics.ndcg5.toFixed(3)}`);
  console.log(`  Target: > 0.7 | Status: ${aggregateMetrics.ndcg5 > 0.7 ? '✅ PASS' : '⚠️  BELOW'}`);

  console.log(`\nAverage Latency:                ${aggregateMetrics.avgLatency.toFixed(1)}ms`);
  console.log(`  Target: < 100ms | Status: ${aggregateMetrics.avgLatency < 100 ? '✅ PASS' : '⚠️  SLOW'}`);

  console.log(`\nPassage Match Rate:             ${aggregateMetrics.passageMatchRate.toFixed(3)}`);
  console.log(`  Target: > 0.8 | Status: ${aggregateMetrics.passageMatchRate > 0.8 ? '✅ PASS' : '⚠️  BELOW'}`);

  console.log('\n' + '═'.repeat(80));

  // Summary
  const passCount = [
    aggregateMetrics.mrr > 0.7,
    aggregateMetrics.precision5 > 0.6,
    aggregateMetrics.recall10 > 0.7,
    aggregateMetrics.avgLatency < 100
  ].filter(Boolean).length;

  console.log(`\n📋 SUMMARY: ${passCount}/4 core metrics passed`);

  if (passCount >= 3) {
    console.log('✅ EVALUATION PASSED: Search quality is acceptable for production');
  } else {
    console.log('⚠️  EVALUATION: Some metrics below target, but system is functional');
  }

  console.log('\n' + '═'.repeat(80));
}

function calculateMetrics(searchResults: any[], testQuery: TestQuery) {
  const relevantIds = new Set(testQuery.expectedPageIds);
  const k5 = 5;
  const k10 = 10;

  // MRR
  let mrr = 0;
  for (let i = 0; i < searchResults.length; i++) {
    if (relevantIds.has(searchResults[i].page.id)) {
      mrr = 1 / (i + 1);
      break;
    }
  }

  // Precision@K
  const top5 = searchResults.slice(0, k5);
  const top10 = searchResults.slice(0, k10);
  const relevantIn5 = top5.filter(r => relevantIds.has(r.page.id)).length;
  const relevantIn10 = top10.filter(r => relevantIds.has(r.page.id)).length;
  const precision5 = relevantIn5 / Math.min(k5, searchResults.length);
  const precision10 = relevantIn10 / Math.min(k10, searchResults.length);

  // Recall@K
  const totalRelevant = relevantIds.size;
  const recall5 = totalRelevant > 0 ? relevantIn5 / totalRelevant : 0;
  const recall10 = totalRelevant > 0 ? relevantIn10 / totalRelevant : 0;

  // NDCG@5
  let dcg = 0;
  let idcg = 0;
  for (let i = 0; i < k5 && i < searchResults.length; i++) {
    const rel = relevantIds.has(searchResults[i].page.id) ? 1 : 0;
    dcg += rel / Math.log2(i + 2);
  }
  for (let i = 0; i < Math.min(k5, totalRelevant); i++) {
    idcg += 1 / Math.log2(i + 2);
  }
  const ndcg5 = idcg > 0 ? dcg / idcg : 0;

  return { mrr, precision5, precision10, recall5, recall10, ndcg5 };
}

function calculateAggregateMetrics(results: any[]): EvaluationMetrics {
  const totalQueries = results.length;

  const mrr = results.reduce((sum, r) => sum + r.metrics.mrr, 0) / totalQueries;
  const precision5 = results.reduce((sum, r) => sum + r.metrics.precision5, 0) / totalQueries;
  const precision10 = results.reduce((sum, r) => sum + r.metrics.precision10, 0) / totalQueries;
  const recall5 = results.reduce((sum, r) => sum + r.metrics.recall5, 0) / totalQueries;
  const recall10 = results.reduce((sum, r) => sum + r.metrics.recall10, 0) / totalQueries;
  const ndcg5 = results.reduce((sum, r) => sum + r.metrics.ndcg5, 0) / totalQueries;
  const avgLatency = results.reduce((sum, r) => sum + r.latency, 0) / totalQueries;

  const passageMatchRate = results.filter(r =>
    r.results.length > 0 && r.results[0].similarity > 0.5
  ).length / totalQueries;

  return {
    mrr,
    precision5,
    precision10,
    recall5,
    recall10,
    ndcg5,
    avgLatency,
    passageMatchRate
  };
}

runLargeScaleEvaluation().catch(err => {
  console.error('❌ Evaluation failed:', err);
  process.exit(1);
});
