/**
 * Recall Background Service Worker
 * Handles extension lifecycle and coordinates background tasks
 */

import { embeddingService } from '../lib/embeddings/EmbeddingService';
import { vectorStore } from '../lib/storage/VectorStore';
import { hybridSearch } from '../lib/search/HybridSearch';
import { summarizerService } from '../lib/summarizer/SummarizerService';
import { TabMonitor } from './TabMonitor';
import { indexingQueue } from './IndexingQueue';
import { indexingPipeline } from './IndexingPipeline';
import { offscreenManager } from './OffscreenManager';
import { ragController } from '../lib/rag/RAGController';

console.log('[Recall] Background service worker started');

// Build-time env guard (Vite replaces import.meta.env); TS type-safe via any
const isProd = (import.meta as any).env?.PROD === true;

// Initialize Phase 3 components
const tabMonitor = new TabMonitor();
let queueProcessor: ReturnType<typeof setInterval> | null = null;

// Flag to track initialization state
let isInitialized = false;
let initializationPromise: Promise<void> | null = null;

/**
 * Initialize the extension when installed or updated
 */
chrome.runtime.onInstalled.addListener(async (details) => {
  console.log('[Recall] Extension installed/updated:', details.reason);

  if (details.reason === 'install') {
    console.log('[Recall] First install - initializing...');

    // Initialize database
    try {
      console.log('[Recall] Initializing vector database...');
      await vectorStore.initialize();
      console.log('[Recall] Vector database initialized successfully');
    } catch (error) {
      console.error('[Recall] Failed to initialize database:', error);
    }

    // Initialize embedding service in background
    try {
      console.log('[Recall] Pre-loading embedding model...');
      await embeddingService.initialize();
      console.log('[Recall] Embedding model loaded successfully');
    } catch (error) {
      console.error('[Recall] Failed to initialize embedding model:', error);
    }

    // Set default configuration
    await chrome.storage.local.set({
      config: {
        dwellTimeThreshold: 10, // 10 seconds for faster testing
        maxIndexedPages: 10000,
        enableAutoIndexing: true,
        version: '1.0.0',
      },
    });

    console.log('[Recall] Initialization complete');
  } else if (details.reason === 'update') {
    console.log('[Recall] Extension updated from', details.previousVersion);
  }

  // Initialize Phase 3 components (on both install and update)
  await initializePhase3();
});

/**
 * Initialize Phase 3: Automatic Indexing
 */
async function initializePhase3(): Promise<void> {
  // If already initialized, skip
  if (isInitialized) {
    console.log('[Recall] Already initialized, skipping...');
    return;
  }

  // If initialization is in progress, wait for it
  if (initializationPromise) {
    console.log('[Recall] Initialization already in progress, waiting...');
    await initializationPromise;
    return;
  }

  // Create and store the initialization promise
  initializationPromise = (async () => {
    console.log('[Recall] Initializing Phase 3 components...');

  try {
    // CRITICAL: Validate Chrome AI API availability first
    console.log('[Recall] Validating Chrome AI API availability...');
    await summarizerService.initialize();
    const isAIAvailable = await summarizerService.isAIApiAvailable();

    if (!isAIAvailable) {
      const errorMsg = 'Chrome AI API (Summarizer) is NOT available. This extension requires Chrome 138+ with Gemini Nano installed. Indexing will be disabled.';
      console.error('[Recall]', errorMsg);

      // Set badge to indicate error
      chrome.action.setBadgeText({ text: '!' });
      chrome.action.setBadgeBackgroundColor({ color: '#dc2626' });
      chrome.action.setTitle({
        title: 'Rewind: Chrome AI API unavailable - requires Chrome 138+ with Gemini Nano'
      });

      throw new Error(errorMsg);
    }

    console.log('[Recall] Chrome AI API validation passed');

    // Initialize indexing queue
    console.log('[Recall] Initializing indexing queue...');
    await indexingQueue.initialize();

    // Clear any stale items from the queue (from tabs open before extension reload)
    const queueSize = indexingQueue.size();
    if (queueSize > 0) {
      console.log(`[Recall] Clearing ${queueSize} stale items from queue (from before extension reload)`);
      await indexingQueue.clear();
    }

    console.log('[Recall] Indexing queue ready');

    // Initialize indexing pipeline
    console.log('[Recall] Initializing indexing pipeline...');
    await indexingPipeline.initialize();
    console.log('[Recall] Indexing pipeline ready');

    // Initialize tab monitor with callback
    console.log('[Recall] Initializing tab monitor...');
    await tabMonitor.initialize(async (tabInfo) => {
      console.log('[Recall] Page loaded, queuing for indexing:', tabInfo.url);
      await indexingQueue.add(tabInfo);
      updateBadge();
    });
    console.log('[Recall] Tab monitor ready (indexing on page load)');

    // Start queue processor
    startQueueProcessor();
    console.log('[Recall] Queue processor started');

    console.log('[Recall] Phase 3 initialized successfully!');
    console.log('[Recall] Ready to index pages immediately on load with Chrome AI Summarizer API');

    // Mark as initialized
    isInitialized = true;
  } catch (error) {
    console.error('[Recall] Failed to initialize Phase 3:', error);
    throw error; // Re-throw to propagate to the promise
  }
  })();

  // Wait for initialization to complete
  await initializationPromise;
}

/**
 * Start the queue processor
 */
function startQueueProcessor(): void {
  if (queueProcessor) {
    console.log('[Recall] Queue processor already running, skipping start');
    return;
  }

  queueProcessor = setInterval(async () => {
    // Skip if already processing
    if (indexingPipeline.isCurrentlyProcessing() || indexingQueue.isCurrentlyProcessing()) {
      console.log('[Recall] Queue processor: Skipping, already processing');
      return;
    }

    // Get next page from queue
    const next = await indexingQueue.getNext();
    if (!next) {
      return;
    }

    console.log('[Recall] Processing queued page:', next.url);

    // Process the page
    indexingQueue.setProcessing(true);
    const result = await indexingPipeline.processPage(next);

    if (result.success) {
      await indexingQueue.markComplete(next.id);
    } else {
      await indexingQueue.markFailed(next.id, result.error || 'Unknown error');
    }

    indexingQueue.setProcessing(false);
    updateBadge();
  }, 500); // Check every 500ms for fast processing

  console.log('[Recall] Queue processor started');
}

/**
 * Update extension badge with queue size
 */
function updateBadge(): void {
  const queueSize = indexingQueue.size();
  if (queueSize > 0) {
    chrome.action.setBadgeText({ text: queueSize.toString() });
    chrome.action.setBadgeBackgroundColor({ color: '#667eea' });
  } else {
    chrome.action.setBadgeText({ text: '' });
  }
}

/**
 * Handle extension startup
 */
chrome.runtime.onStartup.addListener(async () => {
  console.log('[Recall] Browser started, extension active');

  // Reinitialize Phase 3 components on browser startup
  await initializePhase3();
});

/**
 * Run comprehensive search metrics test
 */
async function runSearchMetricsTest() {
  console.log('[Recall] Starting search metrics test...');

  // Test configuration - improved queries that actually match test content
  const testQueries = [
    // Specific queries that should match our test data well
    'tensorflow machine learning platform',
    'javascript programming language',
    'react library user interface',
    'nodejs server runtime javascript',
    'chrome devtools web development',
    'tensorflow neural networks apis',
    'react components state management',
    'nodejs npm package ecosystem',
    // Keep some broader queries for testing
    'machine learning',
    'web development',
    'AI',
    'programming'
  ];

  const searchModes = ['semantic', 'keyword', 'hybrid'] as const;
  const kValues = [5, 10, 20];

  const results = {
    byMode: {} as Record<string, {
      avgTime: number;
      avgResults: number;
      avgSimilarity: number;
      tests: number;
    }>,
    sampleQueries: {} as Record<string, {
      totalTime: number;
      totalResults: number;
      byMode: Record<string, number>;
    }>,
    allTests: [] as Array<{
      query: string;
      mode: string;
      k: number;
      time: number;
      results: number;
      similarities: number[];
    }>
  };

  const modeStats = new Map<string, { times: number[], resultCounts: number[], similarities: number[] }>();

  // Initialize mode stats
  searchModes.forEach(mode => {
    modeStats.set(mode, { times: [], resultCounts: [], similarities: [] });
  });

  let totalTests = 0;
  let allSimilarities: number[] = [];

  // Run tests for each query and mode
  for (const query of testQueries) {
    console.log(`[Recall] Testing query: "${query}"`);

    const queryResults: typeof results.sampleQueries[string] = {
      totalTime: 0,
      totalResults: 0,
      byMode: {}
    };

    for (const mode of searchModes) {
      for (const k of kValues) {
        const startTime = performance.now();

        try {
          const searchResults = await hybridSearch.search(query, {
            mode,
            k,
            minSimilarity: 0.5 // Use the new threshold
          });

          const endTime = performance.now();
          const searchTime = endTime - startTime;

          const similarities = searchResults.map(r => r.similarity || 0);
          const avgSimilarity = similarities.length > 0
            ? similarities.reduce((a, b) => a + b, 0) / similarities.length
            : 0;

          // Store results
          const stats = modeStats.get(mode)!;
          stats.times.push(searchTime);
          stats.resultCounts.push(searchResults.length);
          stats.similarities.push(...similarities);

          allSimilarities.push(...similarities);

          queryResults.totalTime += searchTime;
          queryResults.totalResults += searchResults.length;
          queryResults.byMode[mode] = (queryResults.byMode[mode] || 0) + searchResults.length;

          results.allTests.push({
            query,
            mode,
            k,
            time: searchTime,
            results: searchResults.length,
            similarities
          });

          console.log(`[Recall] ${mode} (k=${k}): ${searchResults.length} results in ${searchTime.toFixed(2)}ms (avg sim: ${avgSimilarity.toFixed(3)})`);

          totalTests++;

        } catch (error) {
          console.error(`[Recall] Search failed for query "${query}" with mode ${mode}:`, error);
          // Still record a failed test
          const stats = modeStats.get(mode)!;
          stats.times.push(0);
          stats.resultCounts.push(0);
          totalTests++;
        }
      }
    }

    results.sampleQueries[query] = queryResults;
  }

  // Calculate aggregated stats by mode
  for (const [mode, stats] of modeStats.entries()) {
    const avgTime = stats.times.length > 0 ? stats.times.reduce((a, b) => a + b, 0) / stats.times.length : 0;
    const avgResults = stats.resultCounts.length > 0 ? stats.resultCounts.reduce((a, b) => a + b, 0) / stats.resultCounts.length : 0;
    const avgSimilarity = stats.similarities.length > 0 ? stats.similarities.reduce((a, b) => a + b, 0) / stats.similarities.length : 0;

    results.byMode[mode] = {
      avgTime,
      avgResults,
      avgSimilarity,
      tests: stats.times.length
    };
  }

  // Calculate summary statistics
  const dbStats = await vectorStore.getStats();
  const avgSearchTime = results.allTests.length > 0
    ? results.allTests.reduce((sum, test) => sum + test.time, 0) / results.allTests.length
    : 0;

  const fastestMode = Object.entries(results.byMode)
    .sort(([, a], [, b]) => a.avgTime - b.avgTime)[0]?.[0] || 'unknown';

  const bestResultMode = Object.entries(results.byMode)
    .sort(([, a], [, b]) => b.avgResults - a.avgResults)[0]?.[0] || 'unknown';

  // Enhanced quality analysis based on similarity scores
  const validSimilarities = allSimilarities.filter(s => s > 0); // Exclude zero similarities from keyword results
  const highQualityResults = validSimilarities.filter(s => s >= 0.8).length;
  const mediumQualityResults = validSimilarities.filter(s => s >= 0.5 && s < 0.8).length;
  const lowQualityResults = validSimilarities.filter(s => s < 0.5).length;

  // Calculate similarity distribution statistics
  const maxSimilarity = validSimilarities.length > 0 ? Math.max(...validSimilarities) : 0;
  const minSimilarity = validSimilarities.length > 0 ? Math.min(...validSimilarities) : 0;
  const medianSimilarity = validSimilarities.length > 0
    ? validSimilarities.sort((a, b) => a - b)[Math.floor(validSimilarities.length / 2)]
    : 0;

  // Check if threshold is being respected (only for semantic results)
  const thresholdRespected = validSimilarities.every(s => s >= 0.5);

  const summary = {
    totalTests,
    totalPages: dbStats.totalPages,
    avgSearchTime,
    fastestMode,
    bestResultMode,
    highQualityResults,
    mediumQualityResults,
    lowQualityResults,
    thresholdRespected,
    thresholdLevel: 0.5,
    // Enhanced similarity analysis
    maxSimilarity: parseFloat(maxSimilarity.toFixed(3)),
    minSimilarity: parseFloat(minSimilarity.toFixed(3)),
    medianSimilarity: parseFloat(medianSimilarity.toFixed(3)),
    totalSemanticResults: validSimilarities.length,
    avgSemanticSimilarity: validSimilarities.length > 0
      ? parseFloat((validSimilarities.reduce((a, b) => a + b, 0) / validSimilarities.length).toFixed(3))
      : 0
  };

  console.log('[Recall] Search metrics test completed:', { totalTests, avgSearchTime, thresholdRespected });

  return {
    results,
    summary
  };
}

/**
 * Create meaningful passages from content for better semantic search
 */
function createPassagesFromContent(content: string, summary: string): Array<{
  id: string;
  text: string;
  wordCount: number;
  position: number;
  quality: number;
}> {
  const passages = [];

  // Always include the summary as a high-quality passage
  passages.push({
    id: 'passage-summary',
    text: summary,
    wordCount: summary.split(/\s+/).length,
    position: 0,
    quality: 0.9, // Summary is highest quality
  });

  // Split content into meaningful chunks (approximately 200-300 words each)
  const words = content.split(/\s+/);
  const targetChunkSize = 250; // words per passage
  const overlap = 50; // overlapping words between passages

  let position = 1;
  for (let i = 0; i < words.length; i += targetChunkSize - overlap) {
    const chunk = words.slice(i, Math.min(i + targetChunkSize, words.length));
    const passageText = chunk.join(' ');

    // Skip very short passages
    if (chunk.length < 50) continue;

    passages.push({
      id: `passage-${position}`,
      text: passageText,
      wordCount: chunk.length,
      position,
      quality: 0.7, // Regular content passages
    });

    position++;
  }

  // Limit to max 6 passages per page to avoid storage bloat
  return passages.slice(0, 6);
}

/**
 * Handle messages from other parts of the extension
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('[Recall] Received message:', message.type, 'from:', sender.tab?.id || 'popup');

  // Handle different message types
  switch (message.type) {
    case 'PING':
      sendResponse({ status: 'ok', timestamp: Date.now() });
      return false;

    case 'GET_STATUS':
      // Get status including database stats
      console.log('[Recall] GET_STATUS request received');
      vectorStore
        .getStats()
        .then((dbStats) => {
          const response = {
            initialized: embeddingService.isInitialized(),
            cacheStats: embeddingService.getCacheStats(),
            dbStats,
          };
          console.log('[Recall] Sending status response:', response);
          sendResponse(response);
        })
        .catch((error) => {
          console.error('[Recall] Failed to get stats:', error);
          const response = {
            initialized: embeddingService.isInitialized(),
            cacheStats: embeddingService.getCacheStats(),
            dbStats: null,
            error: error.message,
          };
          console.log('[Recall] Sending error response:', response);
          sendResponse(response);
        });
      return true; // Async response

    case 'GET_DB_STATS':
      // Get database statistics
      console.log('[Recall] GET_DB_STATS request received');
      vectorStore
        .getStats()
        .then((stats) => {
          console.log('[Recall] Sending DB stats:', stats);
          sendResponse({ success: true, stats });
        })
        .catch((error) => {
          console.error('[Recall] Failed to get DB stats:', error);
          sendResponse({ success: false, error: error.message });
        });
      return true;

    case 'GET_ALL_PAGES':
      // Get all pages (sorted by timestamp - latest first)
      console.log('[Recall] GET_ALL_PAGES request received');
      vectorStore
        .getAllPages()
        .then((pages) => {
          // Sort by timestamp descending (latest first)
          const sortedPages = pages.sort((a, b) => b.timestamp - a.timestamp);
          console.log('[Recall] Sending', sortedPages.length, 'pages (sorted by timestamp)');
          sendResponse({ success: true, pages: sortedPages });
        })
        .catch((error) => {
          console.error('[Recall] Failed to get all pages:', error);
          sendResponse({ success: false, error: error.message });
        });
      return true;

    case 'CLEAR_HISTORY':
      // Clear all history from IndexedDB
      console.log('[Recall] CLEAR_HISTORY request received');
      vectorStore
        .clearAll()
        .then(() => {
          console.log('[Recall] All history cleared successfully');
          // Also clear the indexing queue to remove stale items
          indexingQueue
            .clear()
            .then(() => {
              console.log('[Recall] Indexing queue cleared after history wipe');
            })
            .catch((queueError) => {
              console.error('[Recall] Failed to clear indexing queue:', queueError);
            });
          sendResponse({ success: true });
        })
        .catch((error) => {
          console.error('[Recall] Failed to clear history:', error);
          sendResponse({ success: false, error: error.message });
        });
      return true;

    
    case 'SEARCH_QUERY':
      // Perform hybrid search (semantic + keyword + RRF fusion)
      (async () => {
        try {
          const { query, options } = message;

          // Use hybrid search (defaults to 'hybrid' mode)
          const results = await hybridSearch.search(query, {
            mode: options?.mode || 'hybrid', // Default to hybrid mode
            ...options,
          });

          // Extract page records from SearchResult objects
          const pages = results.map(r => r.page);

          sendResponse({ success: true, results: pages });
        } catch (error) {
          console.error('[Recall] Search failed:', error);
          sendResponse({ success: false, error: (error as Error).message });
        }
      })();
      return true;

    case 'ADD_TEST_PAGE':
      if (!isProd) {
        // Add a test page to the database (dev-only)
        (async () => {
          try {
            const { url, title, content, summary } = message;

            // Create multiple passages from content for better semantic matching
            const passages = createPassagesFromContent(content, summary);

            // Generate embedding from title + summary + content snippet
            // Use first 500 characters of content for better semantic context
            const contentSnippet = content.length > 500 ? content.substring(0, 500) : content;
            const embeddingText = `${title}. ${summary} ${contentSnippet}`;
            const embedding = await embeddingService.generateEmbedding(embeddingText);

            // Add to database
            const id = await vectorStore.addPage({
              url,
              title,
              content,
              summary,
              passages,
              embedding,
              timestamp: Date.now(),
              dwellTime: 60,
              lastAccessed: 0,
            });

            sendResponse({ success: true, id });
          } catch (error) {
            console.error('[Recall] Failed to add test page:', error);
            sendResponse({ success: false, error: (error as Error).message });
          }
        })();
        return true;
      } else {
        sendResponse({ success: false, error: 'Not available in production' });
        return false;
      }

    case 'CLEAR_DATABASE':
      // Clear all data from database (for testing)
      vectorStore
        .clearDatabase()
        .then(() => {
          sendResponse({ success: true });
        })
        .catch((error) => {
          sendResponse({ success: false, error: error.message });
        });
      return true;

    case 'INIT_EMBEDDING_SERVICE':
      // Initialize embedding service asynchronously
      embeddingService
        .initialize()
        .then(() => {
          sendResponse({ success: true });
        })
        .catch((error) => {
          sendResponse({ success: false, error: error.message });
        });
      return true; // Keep message channel open for async response

    case 'UPDATE_LAST_ACCESSED':
      // Update lastAccessed timestamp when user clicks a search result
      (async () => {
        try {
          const { pageId } = message;
          await vectorStore.updatePage(pageId, { lastAccessed: Date.now() });
          sendResponse({ success: true });
        } catch (error) {
          console.error('[Recall] Failed to update lastAccessed:', error);
          sendResponse({ success: false, error: (error as Error).message });
        }
      })();
      return true;

    case 'GET_QUEUE_STATUS':
      // Get indexing queue status
      sendResponse({
        queueSize: indexingQueue.size(),
        isProcessing: indexingPipeline.isCurrentlyProcessing(),
        queuedPages: indexingQueue.getAll().map((p) => ({
          url: p.url,
          title: p.title,
          attempts: p.attempts,
          queuedAt: p.queuedAt,
        })),
      });
      return false;

    case 'PAUSE_INDEXING':
      // Pause indexing
      if (queueProcessor) {
        clearInterval(queueProcessor);
        queueProcessor = null;
        console.log('[Recall] Indexing paused');
        sendResponse({ success: true });
      } else {
        sendResponse({ success: false, error: 'Already paused' });
      }
      return false;

    case 'RESUME_INDEXING':
      // Resume indexing
      if (!queueProcessor) {
        startQueueProcessor();
        sendResponse({ success: true });
      } else {
        sendResponse({ success: false, error: 'Already running' });
      }
      return false;

    case 'CLEAR_QUEUE':
      // Clear indexing queue
      indexingQueue
        .clear()
        .then(() => {
          updateBadge();
          sendResponse({ success: true });
        })
        .catch((error) => {
          sendResponse({ success: false, error: error.message });
        });
      return true;

  
    case 'RUN_SEARCH_METRICS_TEST':
      if (!isProd) {
        // Run comprehensive search metrics test (dev-only)
        (async () => {
          try {
            console.log('[Recall] Running search metrics test...');

            // Get database stats first
            const dbStats = await vectorStore.getStats();
            if (dbStats.totalPages === 0) {
              throw new Error('No indexed pages found. Please browse some websites first.');
            }

            const metrics = await runSearchMetricsTest();

            console.log('[Recall] Search metrics test completed:', metrics);
            sendResponse({ success: true, metrics });
          } catch (error) {
            console.error('[Recall] Search metrics test failed:', error);
            sendResponse({
              success: false,
              error: (error as Error).message,
            });
          }
        })();
        return true;
      } else {
        sendResponse({ success: false, error: 'Not available in production' });
        return false;
      }

    case 'TEST_SUMMARIZER':
      // Test Chrome Summarizer API with sample text
      (async () => {
        try {
          const { text, url, title, maxLength } = message;
          console.log('[Recall] Testing summarizer with:', { textLength: text.length, url, title, maxLength });

          // Initialize summarizer and check API availability
          await summarizerService.initialize();
          const isApiAvailable = await summarizerService.isAIApiAvailable();
          console.log('[Recall] API availability check result:', isApiAvailable);

          const summary = await summarizerService.summarizeForSearch(text, url, title, maxLength);
          const apiType = isApiAvailable ? 'Chrome AI API' : 'Extractive Fallback';

          console.log('[Recall] Summarizer test successful:', {
            summaryLength: summary.length,
            apiType,
            summaryPreview: summary.substring(0, 100) + '...'
          });

          const response = {
            success: true,
            summary,
            apiType,
          };

          console.log('[Recall] Sending TEST_SUMMARIZER response:', response);
          sendResponse(response);
        } catch (error) {
          console.error('[Recall] Summarizer test failed:', error);
          const errorResponse = {
            success: false,
            error: (error as Error).message,
          };
          console.log('[Recall] Sending TEST_SUMMARIZER error response:', errorResponse);
          sendResponse(errorResponse);
        }
      })();
      return true;

    case 'TEST_EMBEDDINGS':
      // Test embedding generation
      (async () => {
        try {
          const { text } = message;
          console.log('[Recall] Testing embeddings with:', { textLength: text.length });

          // Ensure embedding service is initialized
          await embeddingService.initialize();

          const startTime = performance.now();
          const embedding = await embeddingService.generateEmbedding(text);
          const generationTime = performance.now() - startTime;

          console.log('[Recall] Embedding test successful:', {
            dimensions: embedding.length,
            generationTime: generationTime.toFixed(2)
          });

          sendResponse({
            success: true,
            embedding: Array.from(embedding),
            dimensions: embedding.length,
            generationTime: Math.round(generationTime),
            model: 'all-MiniLM-L6-v2'
          });
        } catch (error) {
          console.error('[Recall] Embedding test failed:', error);
          sendResponse({
            success: false,
            error: (error as Error).message,
          });
        }
      })();
      return true;

    case 'TEST_HYBRID_SEARCH':
      // Test hybrid search functionality
      (async () => {
        try {
          const { queries } = message;
          console.log('[Recall] Testing hybrid search with queries:', queries);

          const results = [];

          for (const query of queries) {
            const queryStartTime = performance.now();

            // Test different search modes
            const semanticResults = await hybridSearch.search(query, { mode: 'semantic', k: 10 });
            const keywordResults = await hybridSearch.search(query, { mode: 'keyword', k: 10 });
            const hybridResults = await hybridSearch.search(query, { mode: 'hybrid', k: 10 });

            const queryTime = performance.now() - queryStartTime;

            results.push({
              query,
              semanticCount: semanticResults.length,
              keywordCount: keywordResults.length,
              hybridCount: hybridResults.length,
              processingTime: Math.round(queryTime)
            });
          }

          console.log('[Recall] Hybrid search test successful:', results);

          sendResponse({
            success: true,
            results
          });
        } catch (error) {
          console.error('[Recall] Hybrid search test failed:', error);
          sendResponse({
            success: false,
            error: (error as Error).message,
          });
        }
      })();
      return true;

    case 'SUMMARIZER_RESPONSE':
      // Handle response from offscreen summarizer
      console.log('[Recall] Received summarizer response:', message.response.id);
      offscreenManager.handleResponse(message.response);
      return false;

    case 'OFFSCREEN_SUMMARIZER_READY':
      // Handle ready signal from offscreen document
      console.log('[Recall] Offscreen summarizer is ready');
      return false;

    case 'PROMPT_RESPONSE':
      // Handle response from offscreen prompt API
      console.log('[Recall] Received prompt response:', message.response.id);
      offscreenManager.handlePromptResponse(message.response);
      return false;

    case 'RAG_QUERY':
      // Answer a question using RAG (Retrieval-Augmented Generation)
      (async () => {
        try {
          const { question, options } = message;
          console.log('[Recall] RAG query received:', question);

          const result = await ragController.answerQuestion(question, options);

          sendResponse({
            success: true,
            answer: result.answer,
            sources: result.sources,
            timings: {
              total: result.processingTime,
              search: result.searchTime,
              generation: result.generationTime,
            },
          });
        } catch (error) {
          console.error('[Recall] RAG query failed:', error);
          sendResponse({
            success: false,
            error: (error as Error).message,
          });
        }
      })();
      return true;

    case 'RAG_QUERY_STREAMING':
      // Answer a question using RAG with streaming response
      (async () => {
        try {
          const { question, options } = message;
          console.log('[Recall] RAG streaming query received:', question);

          // Note: Streaming requires a different communication pattern
          // We'll send chunks via separate messages
          const stream = ragController.answerQuestionStreaming(question, options);

          for await (const item of stream) {
            if (item.type === 'chunk') {
              // Send chunk back to UI
              chrome.runtime.sendMessage({
                type: 'RAG_STREAM_CHUNK',
                requestId: message.requestId,
                chunk: item.content,
              }).catch(error => {
                console.error('[Recall] Failed to send RAG chunk:', error);
              });
            } else if (item.type === 'complete') {
              // Send completion with metadata
              chrome.runtime.sendMessage({
                type: 'RAG_STREAM_COMPLETE',
                requestId: message.requestId,
                sources: item.sources,
                timings: item.timings,
              }).catch(error => {
                console.error('[Recall] Failed to send RAG completion:', error);
              });
            }
          }

          sendResponse({ success: true, message: 'Streaming started' });
        } catch (error) {
          console.error('[Recall] RAG streaming query failed:', error);
          chrome.runtime.sendMessage({
            type: 'RAG_STREAM_ERROR',
            requestId: message.requestId,
            error: (error as Error).message,
          }).catch(err => {
            console.error('[Recall] Failed to send RAG error:', err);
          });
          sendResponse({ success: false, error: (error as Error).message });
        }
      })();
      return true;

    case 'CHECK_RAG_AVAILABILITY':
      // Check if RAG functionality is available
      (async () => {
        try {
          const available = await ragController.isAvailable();
          sendResponse({ success: true, available });
        } catch (error) {
          console.error('[Recall] Failed to check RAG availability:', error);
          sendResponse({ success: false, available: false, error: (error as Error).message });
        }
      })();
      return true;

    case 'MANUAL_INDEX_PAGE':
      // Manually index a page (for eval system)
      (async () => {
        try {
          const { pageData } = message;
          console.log('[Recall] Manual indexing request for:', pageData.url);

          // Create passages from content
          const summary = pageData.content.substring(0, 500); // Quick summary for eval
          const passages = createPassagesFromContent(pageData.content, summary);

          // Generate embedding
          const embeddingText = `${pageData.title}. ${summary}`;
          const embedding = await embeddingService.generateEmbedding(embeddingText);

          // Add to database
          const id = await vectorStore.addPage({
            url: pageData.url,
            title: pageData.title,
            content: pageData.content,
            summary,
            passages,
            embedding,
            timestamp: Date.now(),
            dwellTime: 60,
            lastAccessed: 0,
          });

          console.log('[Recall] Page indexed successfully:', id);
          sendResponse({ success: true, id });
        } catch (error) {
          console.error('[Recall] Manual indexing failed:', error);
          sendResponse({ success: false, error: (error as Error).message });
        }
      })();
      return true;

    default:
      console.warn('[Recall] Unknown message type:', message.type);
      sendResponse({ error: 'Unknown message type' });
      return false;
  }
});

/**
 * Keep service worker alive
 * Service workers can be terminated by the browser, this helps keep it active
 */
const KEEP_ALIVE_INTERVAL = 20000; // 20 seconds
setInterval(() => {
  console.log('[Recall] Service worker keepalive ping');
}, KEEP_ALIVE_INTERVAL);

/**
 * Handle keyboard commands
 */
chrome.commands.onCommand.addListener(async (command) => {
  if (command === 'toggle-sidebar') {
    console.log('[Recall] Keyboard shortcut (Cmd+Shift+E) triggered from background');
    await toggleSidebarOnActiveTab();
  }
});

/**
 * Handle extension icon click
 */
chrome.action.onClicked.addListener(async (tab) => {
  console.log('[Recall] Extension icon clicked on tab:', tab.id, tab.url);
  await toggleSidebarOnActiveTab();
});

/**
 * Toggle sidebar on the active tab
 * Shared logic for both keyboard shortcut and icon click
 */
async function toggleSidebarOnActiveTab(): Promise<void> {
  try {
    // Get active tab
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const activeTab = tabs[0];

    if (!activeTab?.id) {
      console.warn('[Recall] No active tab found');
      return;
    }

    // Check if this is a restricted page
    if (activeTab.url?.startsWith('chrome://') ||
        activeTab.url?.startsWith('chrome-extension://') ||
        activeTab.url?.startsWith('edge://')) {
      console.warn('[Recall] Cannot run on restricted pages (chrome://, chrome-extension://, etc)');
      return;
    }

    console.log('[Recall] Sending TOGGLE_SIDEBAR to tab:', activeTab.id, activeTab.url);

    // Try to send message to content script
    try {
      await chrome.tabs.sendMessage(activeTab.id, { type: 'TOGGLE_SIDEBAR' });
      console.log('[Recall] TOGGLE_SIDEBAR message sent successfully');
    } catch (error: any) {
      if (error.message?.includes('Could not establish connection') ||
          error.message?.includes('Receiving end does not exist')) {
        console.error('[Recall] Content script not responding. Try refreshing the page.');
        console.error('[Recall] If the problem persists, the page may block content scripts.');
      } else {
        throw error;
      }
    }
  } catch (error) {
    console.error('[Recall] Error toggling sidebar:', error);
  }
}

console.log('[Recall] Background service worker ready');

// Initialize Phase 3 components immediately when service worker starts
// This ensures initialization happens even when extension is reloaded during development
initializePhase3().catch((error) => {
  console.error('[Recall] Failed to initialize on service worker start:', error);
});
