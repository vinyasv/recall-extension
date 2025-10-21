/**
 * End-to-End Hybrid Search Test
 * Tests semantic, keyword, and hybrid search modes with weighted RRF and confidence scoring
 */

import { embeddingGemmaService } from '../src/lib/embeddings/EmbeddingGemmaService';
import { searchSimilar } from '../src/lib/search/VectorSearch';
import { keywordSearch } from '../src/lib/search/KeywordSearch';
import type { PageRecord, Passage } from '../src/lib/storage/types';
import type { SearchResult } from '../src/lib/search/types';
import { RRF_CONFIG } from '../src/lib/config/searchConfig';

// Test corpus: Realistic pages across different domains
interface TestPage {
  url: string;
  title: string;
  content: string;
  passages: string[];
}

const TEST_CORPUS: TestPage[] = [
  // React Documentation
  {
    url: 'https://react.dev/reference/react/useState',
    title: 'useState – React',
    content: 'useState is a React Hook that lets you add a state variable to your component. Call useState at the top level of your component to declare a state variable.',
    passages: [
      'useState is a React Hook that lets you add a state variable to your component.',
      'Call useState at the top level of your component to declare a state variable.',
      'The convention is to name state variables like [something, setSomething] using array destructuring.',
      'useState returns an array with exactly two values: the current state and a set function.',
    ],
  },
  {
    url: 'https://react.dev/reference/react/useEffect',
    title: 'useEffect – React',
    content: 'useEffect is a React Hook that lets you synchronize a component with an external system. Call useEffect at the top level of your component to declare an Effect.',
    passages: [
      'useEffect is a React Hook that lets you synchronize a component with an external system.',
      'Call useEffect at the top level of your component to declare an Effect.',
      'Effects let you specify side effects that are caused by rendering itself, rather than by a particular event.',
      'useEffect returns undefined. React will call your setup and cleanup functions whenever necessary.',
    ],
  },
  {
    url: 'https://react.dev/learn/thinking-in-react',
    title: 'Thinking in React – React',
    content: 'React can change how you think about the designs you look at and the apps you build. Learn how to build UIs with React in five steps.',
    passages: [
      'Start with the mockup. Break the UI into a component hierarchy.',
      'Build a static version in React without adding any interactivity.',
      'Find the minimal but complete representation of UI state.',
      'Identify where your state should live in the component tree.',
      'Add inverse data flow by passing callbacks down.',
    ],
  },
  // Python Documentation
  {
    url: 'https://docs.python.org/3/tutorial/datastructures.html',
    title: 'Data Structures — Python 3 Documentation',
    content: 'This chapter describes some things you have learned about already in more detail, and adds some new things as well. Learn about lists, tuples, dictionaries, and sets.',
    passages: [
      'Lists are mutable sequences, typically used to store collections of homogeneous items.',
      'The list data type has methods like append, extend, insert, remove, and pop.',
      'Tuples are immutable sequences, typically used to store collections of heterogeneous data.',
      'Dictionaries are indexed by keys, which can be any immutable type.',
      'Sets are unordered collections with no duplicate elements.',
    ],
  },
  {
    url: 'https://docs.python.org/3/library/functions.html#map',
    title: 'map() — Python 3 Documentation',
    content: 'Return an iterator that applies function to every item of iterable, yielding the results. If additional iterable arguments are passed, function must take that many arguments.',
    passages: [
      'map(function, iterable) returns an iterator that applies function to every item.',
      'The function is applied to each element and the results are returned as a map object.',
      'You can convert the map object to a list using list(map(...)).',
      'map is useful for transforming data without explicit loops.',
    ],
  },
  // TypeScript Documentation
  {
    url: 'https://www.typescriptlang.org/docs/handbook/2/everyday-types.html',
    title: 'Everyday Types - TypeScript',
    content: 'Learn about the most common types in TypeScript. This includes primitives, arrays, object types, union types, type aliases, and interfaces.',
    passages: [
      'TypeScript has three very common primitives: string, number, and boolean.',
      'Arrays can be written as number[] or Array<number>.',
      'Object types specify the shape of an object with property types.',
      'Union types allow a value to be one of several types using the | operator.',
      'Type aliases give a name to any type using the type keyword.',
    ],
  },
  {
    url: 'https://www.typescriptlang.org/docs/handbook/2/generics.html',
    title: 'Generics - TypeScript',
    content: 'Generics provide a way to make components work with any data type while still providing compile-time type safety. Learn how to use generic types, classes, and constraints.',
    passages: [
      'Generics allow you to define reusable components that work with multiple types.',
      'Generic functions use type parameters like <T> to define flexible type signatures.',
      'Generic constraints limit the types that can be used with extends keyword.',
      'Generic classes can have generic properties and methods.',
    ],
  },
  // Machine Learning
  {
    url: 'https://scikit-learn.org/stable/modules/linear_model.html',
    title: 'Linear Models - scikit-learn',
    content: 'Linear models make a prediction using a linear function of the input features. This includes linear regression, ridge regression, lasso, and logistic regression.',
    passages: [
      'Linear regression fits a linear model with coefficients to minimize residual sum of squares.',
      'Ridge regression addresses some of the problems of ordinary least squares by imposing a penalty.',
      'Lasso is a linear model that estimates sparse coefficients using L1 regularization.',
      'Logistic regression is used for binary classification despite its name.',
    ],
  },
  {
    url: 'https://pytorch.org/tutorials/beginner/basics/tensorqs_tutorial.html',
    title: 'Tensors - PyTorch',
    content: 'Tensors are a specialized data structure that are very similar to arrays and matrices. In PyTorch, we use tensors to encode the inputs and outputs of a model.',
    passages: [
      'Tensors are similar to NumPy ndarrays, except that they can run on GPUs.',
      'Tensors can be created directly from data using torch.tensor().',
      'Tensors are initialized with specific data types like float32 or int64.',
      'Operations on tensors can be performed on GPU for faster computation.',
    ],
  },
  // Web Development
  {
    url: 'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise',
    title: 'Promise - JavaScript | MDN',
    content: 'The Promise object represents the eventual completion or failure of an asynchronous operation and its resulting value. Learn about promise states, methods, and usage.',
    passages: [
      'A Promise is in one of three states: pending, fulfilled, or rejected.',
      'Promises are created using the Promise constructor with an executor function.',
      'The then() method returns a Promise and takes callback arguments for success and failure.',
      'The catch() method handles rejected promises and returns a new Promise.',
      'Promise.all() waits for all promises to resolve or for any to reject.',
    ],
  },
  {
    url: 'https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API/Using_Fetch',
    title: 'Using the Fetch API - Web APIs | MDN',
    content: 'The Fetch API provides a JavaScript interface for accessing and manipulating parts of the HTTP pipeline, such as requests and responses.',
    passages: [
      'The fetch() method returns a Promise that resolves to the Response object.',
      'Basic fetch usage: fetch(url).then(response => response.json()).then(data => console.log(data)).',
      'Request options include method, headers, body, mode, credentials, and cache.',
      'Response objects provide methods like json(), text(), and blob() to read the body.',
    ],
  },
  // Git Documentation
  {
    url: 'https://git-scm.com/docs/git-commit',
    title: 'git-commit - Git Documentation',
    content: 'Record changes to the repository. Stores the current contents of the index in a new commit along with a log message from the user describing the changes.',
    passages: [
      'git commit creates a new commit containing the current contents of the index.',
      'The -m option allows you to specify the commit message on the command line.',
      'The -a option automatically stages modified and deleted files before committing.',
      'The --amend option replaces the tip of the current branch by creating a new commit.',
    ],
  },
  {
    url: 'https://git-scm.com/docs/git-rebase',
    title: 'git-rebase - Git Documentation',
    content: 'Reapply commits on top of another base tip. If branch is specified, git rebase will perform an automatic git switch before doing anything else.',
    passages: [
      'Rebase reapplies commits from your current branch onto another branch.',
      'Interactive rebase with -i allows you to edit, reorder, or squash commits.',
      'Never rebase commits that exist outside your repository and that people may have based work on.',
      'Rebase is useful for maintaining a clean, linear project history.',
    ],
  },
  // Database
  {
    url: 'https://www.postgresql.org/docs/current/tutorial-join.html',
    title: 'Joins Between Tables - PostgreSQL',
    content: 'Learn about different types of joins in PostgreSQL: inner join, left outer join, right outer join, and full outer join.',
    passages: [
      'Inner join returns only rows where there is a match in both tables.',
      'Left outer join returns all rows from the left table, with matched rows from the right.',
      'Right outer join returns all rows from the right table, with matched rows from the left.',
      'Full outer join returns all rows from both tables, with matches where available.',
    ],
  },
  // Docker
  {
    url: 'https://docs.docker.com/engine/reference/builder/',
    title: 'Dockerfile reference - Docker',
    content: 'Docker can build images automatically by reading instructions from a Dockerfile. A Dockerfile is a text document containing commands to assemble an image.',
    passages: [
      'FROM sets the base image for subsequent instructions.',
      'RUN executes commands in a new layer on top of the current image.',
      'COPY adds files from your Docker client context to the image.',
      'CMD provides defaults for executing a container.',
      'EXPOSE informs Docker that the container listens on specified network ports.',
    ],
  },
];

// Test queries with expected relevant pages
interface TestQuery {
  query: string;
  expectedUrls: string[];
  queryType: 'specific' | 'broad' | 'phrase';
  description: string;
}

const TEST_QUERIES: TestQuery[] = [
  // Specific technical queries (should favor semantic)
  {
    query: 'React hooks for state management',
    expectedUrls: ['https://react.dev/reference/react/useState'],
    queryType: 'specific',
    description: 'Specific React hook query',
  },
  {
    query: 'useEffect side effects synchronization',
    expectedUrls: ['https://react.dev/reference/react/useEffect'],
    queryType: 'specific',
    description: 'Specific useEffect query',
  },
  {
    query: 'Python list methods append extend',
    expectedUrls: ['https://docs.python.org/3/tutorial/datastructures.html'],
    queryType: 'specific',
    description: 'Python data structures query',
  },
  {
    query: 'TypeScript generic type parameters',
    expectedUrls: ['https://www.typescriptlang.org/docs/handbook/2/generics.html'],
    queryType: 'specific',
    description: 'TypeScript generics query',
  },
  
  // Broad topic queries (should use hybrid)
  {
    query: 'React component state',
    expectedUrls: [
      'https://react.dev/reference/react/useState',
      'https://react.dev/learn/thinking-in-react',
    ],
    queryType: 'broad',
    description: 'Broad React state query',
  },
  {
    query: 'machine learning models',
    expectedUrls: ['https://scikit-learn.org/stable/modules/linear_model.html'],
    queryType: 'broad',
    description: 'Broad ML query',
  },
  
  // Exact phrase queries (keyword helps)
  {
    query: 'git commit message',
    expectedUrls: ['https://git-scm.com/docs/git-commit'],
    queryType: 'phrase',
    description: 'Git commit phrase',
  },
  {
    query: 'promise then catch',
    expectedUrls: ['https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise'],
    queryType: 'phrase',
    description: 'JavaScript Promise phrase',
  },
];

// Evaluation metrics
interface EvaluationMetrics {
  precision: number;
  recall: number;
  mrr: number;
  avgResults: number;
  confidenceDistribution: {
    high: number;
    medium: number;
    low: number;
  };
}

// In-memory page storage
let inMemoryPages: PageRecord[] = [];

async function initializeDatabase(): Promise<void> {
  console.log('\n📦 Initializing in-memory database with test corpus...');
  
  await embeddingGemmaService.initialize();
  inMemoryPages = [];
  
  for (const page of TEST_CORPUS) {
    // Generate passage embeddings
    const passagesWithEmbeddings: Passage[] = [];
    
    for (let i = 0; i < page.passages.length; i++) {
      const embedding = await embeddingGemmaService.generateEmbedding(
        page.passages[i],
        'document',
        768,
        page.title  // Include page title for better embedding quality
      );
      
      passagesWithEmbeddings.push({
        id: `passage-${i}`,
        text: page.passages[i],
        wordCount: page.passages[i].split(/\s+/).length,
        position: i,
        quality: 0.8,
        embedding,
      });
    }
    
    // Store page in memory
    inMemoryPages.push({
      id: `page-${inMemoryPages.length}`,
      url: page.url,
      title: page.title,
      content: page.content,
      passages: passagesWithEmbeddings,
      timestamp: Date.now(),
      dwellTime: 60,
      lastAccessed: Date.now(),
      visitCount: 1,
    });
  }
  
  console.log(`✅ Indexed ${TEST_CORPUS.length} pages in memory`);
}

// Helper: dot product similarity
function dotProduct(a: Float32Array, b: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    sum += a[i] * b[i];
  }
  return sum;
}

// Helper: semantic search (passage-only, threshold-based)
async function performSemanticSearch(query: string, threshold: number = 0.70): Promise<SearchResult[]> {
  const queryEmbedding = await embeddingGemmaService.generateEmbedding(query, 'query');
  
  const pageScores = new Map<string, {
    page: PageRecord;
    maxSimilarity: number;
    passageMatches: number;
  }>();
  
  for (const page of inMemoryPages) {
    if (!page.passages || page.passages.length === 0) continue;
    
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

// Helper: keyword search (TF-IDF based)
async function performKeywordSearch(query: string, k: number = 10): Promise<SearchResult[]> {
  // Simple keyword matching for testing
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
        score += 3.0; // Title weight
        matchedTerms.push(term);
      }
      if (passagesLower.includes(term)) {
        score += 2.0; // Passage weight
        if (!matchedTerms.includes(term)) matchedTerms.push(term);
      }
      if (contentLower.includes(term)) {
        score += 1.0; // Content weight
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

// Helper: weighted RRF
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

// Helper: calculate confidence
function calculateConfidence(similarity: number, keywordScore?: number): 'high' | 'medium' | 'low' {
  const hasStrongSemantic = similarity >= 0.70;
  const hasKeyword = (keywordScore || 0) > 0;
  const hasStrongKeyword = (keywordScore || 0) > 0.5;
  
  if (hasStrongSemantic && hasKeyword) return 'high';
  if (hasStrongSemantic) return 'high';
  if (hasStrongKeyword) return 'medium';
  return 'low';
}

function calculateMetrics(
  results: SearchResult[],
  expectedUrls: string[],
  queryType: string
): EvaluationMetrics {
  // Find relevant results
  const relevantResults = results.filter(r => 
    expectedUrls.includes(r.page.url)
  );
  
  // Precision: % of retrieved results that are relevant
  const precision = results.length > 0 
    ? relevantResults.length / results.length 
    : 0;
  
  // Recall: % of relevant results that were retrieved
  const recall = expectedUrls.length > 0
    ? relevantResults.length / expectedUrls.length
    : 0;
  
  // MRR: Reciprocal rank of first relevant result
  let mrr = 0;
  for (let i = 0; i < results.length; i++) {
    if (expectedUrls.includes(results[i].page.url)) {
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
    confidenceDistribution,
  };
}

async function runEvaluation(
  mode: 'semantic' | 'keyword' | 'hybrid',
  alpha?: number
): Promise<Map<string, EvaluationMetrics>> {
  console.log(`\n🔍 Running ${mode.toUpperCase()} evaluation${alpha !== undefined ? ` (alpha=${alpha})` : ''}...`);
  
  const results = new Map<string, EvaluationMetrics>();
  
  for (const testQuery of TEST_QUERIES) {
    let searchResults: SearchResult[] = [];
    
    if (mode === 'semantic') {
      searchResults = await performSemanticSearch(testQuery.query, 0.70);
      searchResults = searchResults.slice(0, 10);
      // Add confidence
      searchResults = searchResults.map(r => ({
        ...r,
        confidence: r.similarity >= 0.70 ? 'high' as const : 'medium' as const,
      }));
    } else if (mode === 'keyword') {
      searchResults = await performKeywordSearch(testQuery.query, 10);
      // Add confidence
      searchResults = searchResults.map(r => ({
        ...r,
        confidence: (r.keywordScore || 0) > 0.5 ? 'medium' as const : 'low' as const,
      }));
    } else {
      // Hybrid mode
      const semanticResults = await performSemanticSearch(testQuery.query, 0.70);
      const keywordResults = await performKeywordSearch(testQuery.query, 30); // 3x multiplier
      
      // Apply weighted RRF
      const alphaWeight = alpha !== undefined ? alpha : 0.7;
      const fusedResults = weightedReciprocalRankFusion(
        [semanticResults.slice(0, 30), keywordResults],
        [alphaWeight, 1 - alphaWeight],
        60
      );
      
      // Enrich with confidence
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
      testQuery.expectedUrls,
      testQuery.queryType
    );
    
    results.set(testQuery.query, metrics);
    
    // Log individual query results
    console.log(`  Query: "${testQuery.query}"`);
    console.log(`    Precision: ${(metrics.precision * 100).toFixed(1)}%`);
    console.log(`    Recall: ${(metrics.recall * 100).toFixed(1)}%`);
    console.log(`    MRR: ${metrics.mrr.toFixed(3)}`);
    console.log(`    Results: ${metrics.avgResults}`);
    console.log(`    Confidence: H=${metrics.confidenceDistribution.high} M=${metrics.confidenceDistribution.medium} L=${metrics.confidenceDistribution.low}`);
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
    confidenceDistribution: {
      high: values.reduce((sum, m) => sum + m.confidenceDistribution.high, 0) / values.length,
      medium: values.reduce((sum, m) => sum + m.confidenceDistribution.medium, 0) / values.length,
      low: values.reduce((sum, m) => sum + m.confidenceDistribution.low, 0) / values.length,
    },
  };
}

async function main() {
  console.log('🧪 Hybrid Search End-to-End Test\n');
  console.log('='.repeat(60));
  
  // Initialize
  await initializeDatabase();
  
  // Test 1: Semantic-only
  const semanticResults = await runEvaluation('semantic');
  const semanticAgg = aggregateMetrics(semanticResults);
  
  // Test 2: Keyword-only
  const keywordResults = await runEvaluation('keyword');
  const keywordAgg = aggregateMetrics(keywordResults);
  
  // Test 3: Hybrid (default alpha=0.7)
  const hybridResults = await runEvaluation('hybrid', 0.7);
  const hybridAgg = aggregateMetrics(hybridResults);
  
  // Test 4: Hybrid (balanced alpha=0.5)
  const balancedResults = await runEvaluation('hybrid', 0.5);
  const balancedAgg = aggregateMetrics(balancedResults);
  
  // Print summary
  console.log('\n' + '='.repeat(60));
  console.log('📊 OVERALL RESULTS\n');
  
  console.log('┌─────────────────┬──────────┬──────────┬──────────┬──────────┐');
  console.log('│ Mode            │ Prec     │ Recall   │ MRR      │ Results  │');
  console.log('├─────────────────┼──────────┼──────────┼──────────┼──────────┤');
  console.log(`│ Semantic        │ ${(semanticAgg.precision * 100).toFixed(1).padStart(6)}%  │ ${(semanticAgg.recall * 100).toFixed(1).padStart(6)}%  │ ${semanticAgg.mrr.toFixed(3).padStart(8)} │ ${semanticAgg.avgResults.toFixed(1).padStart(8)} │`);
  console.log(`│ Keyword         │ ${(keywordAgg.precision * 100).toFixed(1).padStart(6)}%  │ ${(keywordAgg.recall * 100).toFixed(1).padStart(6)}%  │ ${keywordAgg.mrr.toFixed(3).padStart(8)} │ ${keywordAgg.avgResults.toFixed(1).padStart(8)} │`);
  console.log(`│ Hybrid (α=0.7)  │ ${(hybridAgg.precision * 100).toFixed(1).padStart(6)}%  │ ${(hybridAgg.recall * 100).toFixed(1).padStart(6)}%  │ ${hybridAgg.mrr.toFixed(3).padStart(8)} │ ${hybridAgg.avgResults.toFixed(1).padStart(8)} │`);
  console.log(`│ Hybrid (α=0.5)  │ ${(balancedAgg.precision * 100).toFixed(1).padStart(6)}%  │ ${(balancedAgg.recall * 100).toFixed(1).padStart(6)}%  │ ${balancedAgg.mrr.toFixed(3).padStart(8)} │ ${balancedAgg.avgResults.toFixed(1).padStart(8)} │`);
  console.log('└─────────────────┴──────────┴──────────┴──────────┴──────────┘');
  
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
  
  // Best precision
  const precisions = [
    { mode: 'Semantic', value: semanticAgg.precision },
    { mode: 'Keyword', value: keywordAgg.precision },
    { mode: 'Hybrid (α=0.7)', value: hybridAgg.precision },
    { mode: 'Hybrid (α=0.5)', value: balancedAgg.precision },
  ];
  const bestPrecision = precisions.reduce((max, p) => p.value > max.value ? p : max);
  console.log(`✅ Best Precision: ${bestPrecision.mode} (${(bestPrecision.value * 100).toFixed(1)}%)`);
  
  // Best recall
  const recalls = [
    { mode: 'Semantic', value: semanticAgg.recall },
    { mode: 'Keyword', value: keywordAgg.recall },
    { mode: 'Hybrid (α=0.7)', value: hybridAgg.recall },
    { mode: 'Hybrid (α=0.5)', value: balancedAgg.recall },
  ];
  const bestRecall = recalls.reduce((max, r) => r.value > max.value ? r : max);
  console.log(`✅ Best Recall: ${bestRecall.mode} (${(bestRecall.value * 100).toFixed(1)}%)`);
  
  // Best MRR
  const mrrs = [
    { mode: 'Semantic', value: semanticAgg.mrr },
    { mode: 'Keyword', value: keywordAgg.mrr },
    { mode: 'Hybrid (α=0.7)', value: hybridAgg.mrr },
    { mode: 'Hybrid (α=0.5)', value: balancedAgg.mrr },
  ];
  const bestMRR = mrrs.reduce((max, m) => m.value > max.value ? m : max);
  console.log(`✅ Best MRR: ${bestMRR.mode} (${bestMRR.value.toFixed(3)})`);
  
  // Recommendations
  console.log('\n💡 RECOMMENDATIONS:\n');
  
  if (hybridAgg.precision > semanticAgg.precision && hybridAgg.recall > semanticAgg.recall) {
    console.log('✅ Hybrid search (α=0.7) outperforms both semantic and keyword alone.');
    console.log('   → Use as default for best balance of precision and recall.');
  } else if (semanticAgg.precision >= hybridAgg.precision) {
    console.log('⚠️  Semantic-only matches or exceeds hybrid precision.');
    console.log('   → Consider increasing alpha (e.g., 0.8-0.9) to trust semantic more.');
  }
  
  if (hybridAgg.confidenceDistribution.high > 5) {
    console.log('✅ High-confidence results dominate, indicating reliable matches.');
  } else {
    console.log('⚠️  Few high-confidence results. Check if threshold (0.70) needs adjustment.');
  }
  
  console.log('\n' + '='.repeat(60));
  console.log('✅ Test complete!\n');
}

main().catch(console.error);

