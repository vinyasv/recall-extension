/**
 * Comprehensive End-to-End Test
 * Tests the entire pipeline: extraction → chunking → embedding → indexing → search
 * Uses ~500 realistic pages across multiple domains
 */

import { embeddingGemmaService } from '../src/lib/embeddings/EmbeddingGemmaService';
import type { PageRecord, Passage } from '../src/lib/storage/types';
import type { SearchResult } from '../src/lib/search/types';
import { RRF_CONFIG } from '../src/lib/config/searchConfig';
import { generateLargeCorpus } from './generate-realistic-test-corpus';

// Simple text chunking (no DOM required)
function chunkText(text: string, maxChunkSize: number = 300, overlapSize: number = 50): string[] {
  const words = text.split(/\s+/);
  const chunks: string[] = [];
  
  for (let i = 0; i < words.length; i += maxChunkSize - overlapSize) {
    const chunk = words.slice(i, i + maxChunkSize).join(' ');
    if (chunk.trim().length > 0) {
      chunks.push(chunk);
    }
  }
  
  return chunks.length > 0 ? chunks : [text]; // Return original text if no chunks
}

// Test queries with expected domains
interface TestQuery {
  query: string;
  expectedDomains: string[];
  expectedKeywords: string[];
  queryType: 'specific' | 'broad' | 'cross-domain';
  description: string;
}

const TEST_QUERIES: TestQuery[] = [
  // React-specific queries
  {
    query: 'useState hook React state management',
    expectedDomains: ['react.dev'],
    expectedKeywords: ['useState', 'hook', 'state'],
    queryType: 'specific',
    description: 'Specific React useState query',
  },
  {
    query: 'useEffect side effects lifecycle',
    expectedDomains: ['react.dev'],
    expectedKeywords: ['useEffect', 'side effects'],
    queryType: 'specific',
    description: 'React useEffect query',
  },
  
  // Python-specific queries
  {
    query: 'Python lists mutable sequences arrays',
    expectedDomains: ['docs.python.org'],
    expectedKeywords: ['lists', 'Python', 'mutable'],
    queryType: 'specific',
    description: 'Python lists query',
  },
  {
    query: 'Python dictionaries key-value pairs',
    expectedDomains: ['docs.python.org'],
    expectedKeywords: ['dictionaries', 'key-value'],
    queryType: 'specific',
    description: 'Python dictionaries query',
  },
  
  // TypeScript-specific queries
  {
    query: 'TypeScript generics type parameters',
    expectedDomains: ['www.typescriptlang.org'],
    expectedKeywords: ['generics', 'TypeScript', 'type parameters'],
    queryType: 'specific',
    description: 'TypeScript generics query',
  },
  {
    query: 'TypeScript interfaces contracts objects',
    expectedDomains: ['www.typescriptlang.org'],
    expectedKeywords: ['interfaces', 'TypeScript'],
    queryType: 'specific',
    description: 'TypeScript interfaces query',
  },
  
  // Web dev queries (MDN)
  {
    query: 'JavaScript promises async await',
    expectedDomains: ['developer.mozilla.org'],
    expectedKeywords: ['promises', 'async', 'JavaScript'],
    queryType: 'specific',
    description: 'JavaScript promises query',
  },
  {
    query: 'JavaScript closures scope functions',
    expectedDomains: ['developer.mozilla.org'],
    expectedKeywords: ['closures', 'JavaScript', 'scope'],
    queryType: 'specific',
    description: 'JavaScript closures query',
  },
  
  // Node.js queries
  {
    query: 'Node.js event loop asynchronous',
    expectedDomains: ['nodejs.org'],
    expectedKeywords: ['event loop', 'Node.js', 'asynchronous'],
    queryType: 'specific',
    description: 'Node.js event loop query',
  },
  {
    query: 'Node.js streams data buffers',
    expectedDomains: ['nodejs.org'],
    expectedKeywords: ['streams', 'Node.js', 'data'],
    queryType: 'specific',
    description: 'Node.js streams query',
  },
  
  // Broad topic queries (should return multiple domains)
  {
    query: 'asynchronous programming patterns',
    expectedDomains: ['developer.mozilla.org', 'nodejs.org'],
    expectedKeywords: ['asynchronous', 'async'],
    queryType: 'broad',
    description: 'Broad async programming query',
  },
  {
    query: 'data structures collections',
    expectedDomains: ['docs.python.org', 'developer.mozilla.org'],
    expectedKeywords: ['data structures'],
    queryType: 'broad',
    description: 'Broad data structures query',
  },
  
  // Cross-domain queries
  {
    query: 'type systems static typing',
    expectedDomains: ['www.typescriptlang.org', 'docs.python.org'],
    expectedKeywords: ['types', 'typing'],
    queryType: 'cross-domain',
    description: 'Cross-domain typing query',
  },
  {
    query: 'error handling exceptions',
    expectedDomains: ['docs.python.org', 'nodejs.org', 'developer.mozilla.org'],
    expectedKeywords: ['error', 'exceptions'],
    queryType: 'cross-domain',
    description: 'Cross-domain error handling query',
  },
];

// Evaluation metrics
interface EvaluationMetrics {
  precision: number;
  recall: number;
  mrr: number;
  avgResults: number;
  avgDomainMatch: number;
  avgKeywordMatch: number;
  confidenceDistribution: {
    high: number;
    medium: number;
    low: number;
  };
}

// In-memory storage
let inMemoryPages: PageRecord[] = [];

// ============================================================================
// STAGE 1: CONTENT EXTRACTION & PASSAGE CHUNKING
// ============================================================================

async function extractAndChunkContent(page: { url: string; title: string; content: string }): Promise<Passage[]> {
  // Chunk the content into passages (simple text-based chunking)
  const chunks = chunkText(page.content, 300, 50);
  
  const passages: Passage[] = [];
  
  for (let i = 0; i < chunks.length; i++) {
    passages.push({
      id: `passage-${i}`,
      text: chunks[i],
      wordCount: chunks[i].split(/\s+/).length,
      position: i,
      quality: 0.8, // Simplified quality score
    });
  }
  
  return passages;
}

// ============================================================================
// STAGE 2: EMBEDDING GENERATION
// ============================================================================

async function generateEmbeddings(passages: Passage[]): Promise<Passage[]> {
  const passagesWithEmbeddings: Passage[] = [];
  
  for (const passage of passages) {
    const embedding = await embeddingGemmaService.generateEmbedding(
      passage.text,
      'document'
    );
    
    passagesWithEmbeddings.push({
      ...passage,
      embedding,
    });
  }
  
  return passagesWithEmbeddings;
}

// ============================================================================
// STAGE 3: INDEXING
// ============================================================================

async function indexCorpus(): Promise<void> {
  console.log('\n📦 STAGE 1-3: Extraction → Chunking → Embedding → Indexing...');
  
  await embeddingGemmaService.initialize();
  const corpus = generateLargeCorpus();
  
  console.log(`   Generated ${corpus.length} pages`);
  console.log('   Processing pages...');
  
  inMemoryPages = [];
  let processed = 0;
  const startTime = Date.now();
  
  for (const page of corpus) {
    // Stage 1: Extract and chunk
    const passages = await extractAndChunkContent(page);
    
    // Stage 2: Generate embeddings
    const passagesWithEmbeddings = await generateEmbeddings(passages);
    
    // Stage 3: Store in memory
    inMemoryPages.push({
      id: `page-${processed}`,
      url: page.url,
      title: page.title,
      content: page.content,
      passages: passagesWithEmbeddings,
      timestamp: Date.now(),
      dwellTime: 60,
      lastAccessed: Date.now(),
      visitCount: 1,
    });
    
    processed++;
    
    // Progress indicator
    if (processed % 50 === 0) {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      const rate = (processed / (Date.now() - startTime) * 1000).toFixed(1);
      console.log(`   Processed ${processed}/${corpus.length} pages (${rate} pages/sec, ${elapsed}s elapsed)`);
    }
  }
  
  const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`✅ Indexed ${processed} pages in ${totalTime}s`);
  console.log(`   Avg passages per page: ${(inMemoryPages.reduce((sum, p) => sum + p.passages.length, 0) / inMemoryPages.length).toFixed(1)}`);
}

// ============================================================================
// STAGE 4: SEARCH
// ============================================================================

// Dot product similarity
function dotProduct(a: Float32Array, b: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    sum += a[i] * b[i];
  }
  return sum;
}

// Semantic search (passage-only, threshold-based)
async function performSemanticSearch(query: string, threshold: number = 0.70): Promise<SearchResult[]> {
  const queryEmbedding = await embeddingGemmaService.generateEmbedding(query, 'query');
  
  const pageScores = new Map<string, {
    page: PageRecord;
    maxSimilarity: number;
    passageMatches: number;
  }>();
  
  for (const page of inMemoryPages) {
    let maxSimilarity = 0;
    let passageMatches = 0;
    
    for (const passage of page.passages) {
      if (!passage.embedding) continue;
      
      const similarity = dotProduct(queryEmbedding, passage.embedding);
      
      if (similarity >= threshold) {
        maxSimilarity = Math.max(maxSimilarity, similarity);
        passageMatches++;
      }
    }
    
    if (passageMatches > 0) {
      pageScores.set(page.id, { page, maxSimilarity, passageMatches });
    }
  }
  
  const results: SearchResult[] = [];
  for (const [_, pageData] of pageScores) {
    let relevanceScore = pageData.maxSimilarity;
    if (pageData.passageMatches > 1) {
      relevanceScore += Math.log(pageData.passageMatches) * 0.05;
    }
    
    results.push({
      page: pageData.page,
      similarity: pageData.maxSimilarity,
      relevanceScore,
      searchMode: 'semantic',
    });
  }
  
  results.sort((a, b) => b.relevanceScore - a.relevanceScore);
  return results;
}

// Keyword search (simplified TF-IDF)
async function performKeywordSearch(query: string, k: number = 10): Promise<SearchResult[]> {
  const queryLower = query.toLowerCase();
  const queryTerms = queryLower.split(/\s+/).filter(t => t.length >= 3);
  
  const results: SearchResult[] = [];
  
  for (const page of inMemoryPages) {
    const titleLower = page.title.toLowerCase();
    const contentLower = page.content.toLowerCase();
    const passagesLower = page.passages.map(p => p.text.toLowerCase()).join(' ');
    
    let score = 0;
    const matchedTerms: string[] = [];
    
    for (const term of queryTerms) {
      if (titleLower.includes(term)) {
        score += 3.0;
        matchedTerms.push(term);
      }
      if (passagesLower.includes(term)) {
        score += 2.0;
        if (!matchedTerms.includes(term)) matchedTerms.push(term);
      }
      if (contentLower.includes(term)) {
        score += 1.0;
        if (!matchedTerms.includes(term)) matchedTerms.push(term);
      }
    }
    
    if (score > 0) {
      results.push({
        page,
        similarity: 0,
        relevanceScore: score,
        keywordScore: score,
        matchedTerms,
        searchMode: 'keyword',
      });
    }
  }
  
  results.sort((a, b) => b.relevanceScore - a.relevanceScore);
  return results.slice(0, k);
}

// Weighted RRF
function weightedReciprocalRankFusion(
  rankedLists: SearchResult[][],
  weights: number[] = [1.0, 1.0],
  k: number = 60
): SearchResult[] {
  const scoreMap = new Map<string, SearchResult>();
  
  const totalWeight = weights.reduce((sum, w) => sum + w, 0);
  const normalizedWeights = weights.map(w => w / totalWeight);
  
  for (let i = 0; i < rankedLists.length; i++) {
    const rankedList = rankedLists[i];
    const weight = normalizedWeights[i] || 1.0;
    
    rankedList.forEach((result, index) => {
      const rank = index + 1;
      const rrfScore = weight * (1 / (k + rank));
      
      const existing = scoreMap.get(result.page.id);
      if (existing) {
        existing.relevanceScore += rrfScore;
      } else {
        scoreMap.set(result.page.id, {
          ...result,
          relevanceScore: rrfScore,
        });
      }
    });
  }
  
  const combined = Array.from(scoreMap.values());
  combined.sort((a, b) => b.relevanceScore - a.relevanceScore);
  
  return combined;
}

// Calculate confidence
function calculateConfidence(similarity: number, keywordScore?: number): 'high' | 'medium' | 'low' {
  const hasStrongSemantic = similarity >= 0.70;
  const hasKeyword = (keywordScore || 0) > 0;
  const hasStrongKeyword = (keywordScore || 0) > 0.5;
  
  if (hasStrongSemantic && hasKeyword) return 'high';
  if (hasStrongSemantic) return 'high';
  if (hasStrongKeyword) return 'medium';
  return 'low';
}

// ============================================================================
// STAGE 5: EVALUATION
// ============================================================================

function extractDomain(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}

function calculateMetrics(
  results: SearchResult[],
  expectedDomains: string[],
  expectedKeywords: string[]
): EvaluationMetrics {
  // Domain matching
  const resultDomains = results.map(r => extractDomain(r.page.url));
  const domainMatches = resultDomains.filter(d => expectedDomains.includes(d)).length;
  const avgDomainMatch = results.length > 0 ? domainMatches / results.length : 0;
  
  // Keyword matching (check if result titles/content contain expected keywords)
  let keywordMatches = 0;
  for (const result of results) {
    const textLower = `${result.page.title} ${result.page.content}`.toLowerCase();
    const hasKeyword = expectedKeywords.some(kw => textLower.includes(kw.toLowerCase()));
    if (hasKeyword) keywordMatches++;
  }
  const avgKeywordMatch = results.length > 0 ? keywordMatches / results.length : 0;
  
  // Precision: % of results that match expected domains
  const precision = avgDomainMatch;
  
  // Recall: Did we find at least one result from each expected domain?
  const foundDomains = new Set(resultDomains);
  const recalledDomains = expectedDomains.filter(d => foundDomains.has(d)).length;
  const recall = expectedDomains.length > 0 ? recalledDomains / expectedDomains.length : 0;
  
  // MRR: Reciprocal rank of first matching domain
  let mrr = 0;
  for (let i = 0; i < results.length; i++) {
    if (expectedDomains.includes(extractDomain(results[i].page.url))) {
      mrr = 1 / (i + 1);
      break;
    }
  }
  
  // Confidence distribution
  const confidenceDistribution = {
    high: results.filter(r => r.confidence === 'high').length,
    medium: results.filter(r => r.confidence === 'medium').length,
    low: results.filter(r => r.confidence === 'low').length,
  };
  
  return {
    precision,
    recall,
    mrr,
    avgResults: results.length,
    avgDomainMatch,
    avgKeywordMatch,
    confidenceDistribution,
  };
}

async function runEvaluation(
  mode: 'semantic' | 'keyword' | 'hybrid',
  alpha?: number
): Promise<Map<string, EvaluationMetrics>> {
  console.log(`\n🔍 STAGE 4-5: Search & Evaluation (${mode.toUpperCase()}${alpha !== undefined ? `, alpha=${alpha}` : ''})...`);
  
  const results = new Map<string, EvaluationMetrics>();
  
  for (const testQuery of TEST_QUERIES) {
    let searchResults: SearchResult[] = [];
    
    if (mode === 'semantic') {
      searchResults = await performSemanticSearch(testQuery.query, 0.70);
      searchResults = searchResults.slice(0, 10);
      searchResults = searchResults.map(r => ({
        ...r,
        confidence: r.similarity >= 0.70 ? 'high' as const : 'medium' as const,
      }));
    } else if (mode === 'keyword') {
      searchResults = await performKeywordSearch(testQuery.query, 10);
      searchResults = searchResults.map(r => ({
        ...r,
        confidence: (r.keywordScore || 0) > 0.5 ? 'medium' as const : 'low' as const,
      }));
    } else {
      // Hybrid
      const semanticResults = await performSemanticSearch(testQuery.query, 0.70);
      const keywordResults = await performKeywordSearch(testQuery.query, 30);
      
      const alphaWeight = alpha !== undefined ? alpha : 0.7;
      const fusedResults = weightedReciprocalRankFusion(
        [semanticResults.slice(0, 30), keywordResults],
        [alphaWeight, 1 - alphaWeight],
        60
      );
      
      searchResults = fusedResults.slice(0, 10).map(result => {
        const semanticMatch = semanticResults.find(sr => sr.page.id === result.page.id);
        const keywordMatch = keywordResults.find(kr => kr.page.id === result.page.id);
        
        const similarity = semanticMatch?.similarity || 0;
        const keywordScore = keywordMatch?.keywordScore;
        const confidence = calculateConfidence(similarity, keywordScore);
        
        return {
          ...result,
          similarity,
          keywordScore,
          matchedTerms: keywordMatch?.matchedTerms,
          searchMode: 'hybrid' as const,
          confidence,
        };
      });
    }
    
    const metrics = calculateMetrics(
      searchResults,
      testQuery.expectedDomains,
      testQuery.expectedKeywords
    );
    
    results.set(testQuery.query, metrics);
  }
  
  return results;
}

function aggregateMetrics(results: Map<string, EvaluationMetrics>): EvaluationMetrics {
  const values = Array.from(results.values());
  
  return {
    precision: values.reduce((sum, m) => sum + m.precision, 0) / values.length,
    recall: values.reduce((sum, m) => sum + m.recall, 0) / values.length,
    mrr: values.reduce((sum, m) => sum + m.mrr, 0) / values.length,
    avgResults: values.reduce((sum, m) => sum + m.avgResults, 0) / values.length,
    avgDomainMatch: values.reduce((sum, m) => sum + m.avgDomainMatch, 0) / values.length,
    avgKeywordMatch: values.reduce((sum, m) => sum + m.avgKeywordMatch, 0) / values.length,
    confidenceDistribution: {
      high: values.reduce((sum, m) => sum + m.confidenceDistribution.high, 0) / values.length,
      medium: values.reduce((sum, m) => sum + m.confidenceDistribution.medium, 0) / values.length,
      low: values.reduce((sum, m) => sum + m.confidenceDistribution.low, 0) / values.length,
    },
  };
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  console.log('🧪 COMPREHENSIVE END-TO-END TEST');
  console.log('='.repeat(70));
  console.log('Testing: Extraction → Chunking → Embedding → Indexing → Search');
  console.log('='.repeat(70));
  
  // Index corpus
  await indexCorpus();
  
  // Run evaluations
  const semanticResults = await runEvaluation('semantic');
  const semanticAgg = aggregateMetrics(semanticResults);
  
  const keywordResults = await runEvaluation('keyword');
  const keywordAgg = aggregateMetrics(keywordResults);
  
  const hybridResults = await runEvaluation('hybrid', 0.7);
  const hybridAgg = aggregateMetrics(hybridResults);
  
  const balancedResults = await runEvaluation('hybrid', 0.5);
  const balancedAgg = aggregateMetrics(balancedResults);
  
  // Print results
  console.log('\n' + '='.repeat(70));
  console.log('📊 FINAL RESULTS\n');
  
  console.log('┌─────────────────┬──────────┬──────────┬──────────┬──────────┬──────────┐');
  console.log('│ Mode            │ Prec     │ Recall   │ MRR      │ Results  │ KW Match │');
  console.log('├─────────────────┼──────────┼──────────┼──────────┼──────────┼──────────┤');
  console.log(`│ Semantic        │ ${(semanticAgg.precision * 100).toFixed(1).padStart(6)}%  │ ${(semanticAgg.recall * 100).toFixed(1).padStart(6)}%  │ ${semanticAgg.mrr.toFixed(3).padStart(8)} │ ${semanticAgg.avgResults.toFixed(1).padStart(8)} │ ${(semanticAgg.avgKeywordMatch * 100).toFixed(1).padStart(6)}%  │`);
  console.log(`│ Keyword         │ ${(keywordAgg.precision * 100).toFixed(1).padStart(6)}%  │ ${(keywordAgg.recall * 100).toFixed(1).padStart(6)}%  │ ${keywordAgg.mrr.toFixed(3).padStart(8)} │ ${keywordAgg.avgResults.toFixed(1).padStart(8)} │ ${(keywordAgg.avgKeywordMatch * 100).toFixed(1).padStart(6)}%  │`);
  console.log(`│ Hybrid (α=0.7)  │ ${(hybridAgg.precision * 100).toFixed(1).padStart(6)}%  │ ${(hybridAgg.recall * 100).toFixed(1).padStart(6)}%  │ ${hybridAgg.mrr.toFixed(3).padStart(8)} │ ${hybridAgg.avgResults.toFixed(1).padStart(8)} │ ${(hybridAgg.avgKeywordMatch * 100).toFixed(1).padStart(6)}%  │`);
  console.log(`│ Hybrid (α=0.5)  │ ${(balancedAgg.precision * 100).toFixed(1).padStart(6)}%  │ ${(balancedAgg.recall * 100).toFixed(1).padStart(6)}%  │ ${balancedAgg.mrr.toFixed(3).padStart(8)} │ ${balancedAgg.avgResults.toFixed(1).padStart(8)} │ ${(balancedAgg.avgKeywordMatch * 100).toFixed(1).padStart(6)}%  │`);
  console.log('└─────────────────┴──────────┴──────────┴──────────┴──────────┴──────────┘');
  
  console.log('\n📈 Confidence Distribution (avg per query):\n');
  console.log('┌─────────────────┬──────────┬──────────┬──────────┐');
  console.log('│ Mode            │ High     │ Medium   │ Low      │');
  console.log('├─────────────────┼──────────┼──────────┼──────────┤');
  console.log(`│ Semantic        │ ${semanticAgg.confidenceDistribution.high.toFixed(1).padStart(8)} │ ${semanticAgg.confidenceDistribution.medium.toFixed(1).padStart(8)} │ ${semanticAgg.confidenceDistribution.low.toFixed(1).padStart(8)} │`);
  console.log(`│ Keyword         │ ${keywordAgg.confidenceDistribution.high.toFixed(1).padStart(8)} │ ${keywordAgg.confidenceDistribution.medium.toFixed(1).padStart(8)} │ ${keywordAgg.confidenceDistribution.low.toFixed(1).padStart(8)} │`);
  console.log(`│ Hybrid (α=0.7)  │ ${hybridAgg.confidenceDistribution.high.toFixed(1).padStart(8)} │ ${hybridAgg.confidenceDistribution.medium.toFixed(1).padStart(8)} │ ${hybridAgg.confidenceDistribution.low.toFixed(1).padStart(8)} │`);
  console.log(`│ Hybrid (α=0.5)  │ ${balancedAgg.confidenceDistribution.high.toFixed(1).padStart(8)} │ ${balancedAgg.confidenceDistribution.medium.toFixed(1).padStart(8)} │ ${balancedAgg.confidenceDistribution.low.toFixed(1).padStart(8)} │`);
  console.log('└─────────────────┴──────────┴──────────┴──────────┘');
  
  // Analysis
  console.log('\n🎯 ANALYSIS:\n');
  
  const modes = [
    { name: 'Semantic', agg: semanticAgg },
    { name: 'Keyword', agg: keywordAgg },
    { name: 'Hybrid (α=0.7)', agg: hybridAgg },
    { name: 'Hybrid (α=0.5)', agg: balancedAgg },
  ];
  
  const bestPrecision = modes.reduce((max, m) => m.agg.precision > max.agg.precision ? m : max);
  const bestRecall = modes.reduce((max, m) => m.agg.recall > max.agg.recall ? m : max);
  const bestMRR = modes.reduce((max, m) => m.agg.mrr > max.agg.mrr ? m : max);
  
  console.log(`✅ Best Precision: ${bestPrecision.name} (${(bestPrecision.agg.precision * 100).toFixed(1)}%)`);
  console.log(`✅ Best Recall: ${bestRecall.name} (${(bestRecall.agg.recall * 100).toFixed(1)}%)`);
  console.log(`✅ Best MRR: ${bestMRR.name} (${bestMRR.agg.mrr.toFixed(3)})`);
  
  console.log('\n💡 RECOMMENDATIONS:\n');
  
  if (hybridAgg.precision >= Math.max(semanticAgg.precision, keywordAgg.precision)) {
    console.log('✅ Hybrid search (α=0.7) provides best or equal precision.');
  } else {
    console.log('⚠️  One of the single-mode searches outperforms hybrid.');
  }
  
  if (hybridAgg.recall > semanticAgg.recall) {
    console.log('✅ Hybrid improves recall over semantic-only (keyword provides coverage).');
  }
  
  if (hybridAgg.confidenceDistribution.high >= 5) {
    console.log('✅ High-confidence results dominate, indicating reliable matches.');
  }
  
  console.log('\n' + '='.repeat(70));
  console.log('✅ End-to-end test complete!');
  console.log(`   Total pages indexed: ${inMemoryPages.length}`);
  console.log(`   Total queries tested: ${TEST_QUERIES.length}`);
  console.log('='.repeat(70));
}

main().catch(console.error);

