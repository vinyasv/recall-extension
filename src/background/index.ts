/**
 * Rewind. Background Service Worker
 * Handles extension lifecycle and coordinates background tasks
 */

import { embeddingGemmaService } from '../lib/embeddings/EmbeddingGemmaService';
import { vectorStore } from '../lib/storage/VectorStore';
import { hybridSearch } from '../lib/search/HybridSearch';
import { ragController } from '../lib/rag/RAGController';
import { TabMonitor } from './TabMonitor';
import { indexingQueue } from './IndexingQueue';
import { indexingPipeline } from './IndexingPipeline';
import { offscreenManager } from './OffscreenManager';
import type { PageMetadata, PageRecord } from '../lib/storage/types';

console.log('[Rewind.] Background service worker started');

// Initialize Phase 3 components
const tabMonitor = new TabMonitor();
let queueProcessor: ReturnType<typeof setInterval> | null = null;

const HISTORY_CHUNK_SIZE = 100;
const EXPORT_CHUNK_SIZE = 25;

async function streamPageMetadataToTab(tabId: number, requestId: string, pages: PageMetadata[]): Promise<void> {
  const totalChunks = Math.ceil(pages.length / HISTORY_CHUNK_SIZE);

  for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
    const start = chunkIndex * HISTORY_CHUNK_SIZE;
    const end = start + HISTORY_CHUNK_SIZE;
    const chunk = pages.slice(start, end);

    try {
      await chrome.tabs.sendMessage(tabId, {
        type: 'GET_ALL_PAGES_CHUNK',
        requestId,
        chunkIndex,
        totalChunks,
        pages: chunk,
      });
    } catch (error) {
      console.warn('[Rewind.] Failed to deliver history chunk:', error);
      return;
    }
  }

  try {
    await chrome.tabs.sendMessage(tabId, {
      type: 'GET_ALL_PAGES_COMPLETE',
      requestId,
      totalPages: pages.length,
      totalChunks,
    });
  } catch (error) {
    console.warn('[Rewind.] Failed to deliver history completion notice:', error);
  }
}

async function streamPageRecordsToTab(tabId: number, requestId: string, pages: PageRecord[]): Promise<void> {
  const totalChunks = Math.ceil(pages.length / EXPORT_CHUNK_SIZE);

  for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
    const start = chunkIndex * EXPORT_CHUNK_SIZE;
    const end = start + EXPORT_CHUNK_SIZE;
    const chunk = pages.slice(start, end);

    try {
      await chrome.tabs.sendMessage(tabId, {
        type: 'EXPORT_INDEX_CHUNK',
        requestId,
        chunkIndex,
        totalChunks,
        pages: chunk,
      });
    } catch (error) {
      console.warn('[Rewind.] Failed to deliver export chunk:', error);
      return;
    }
  }

  try {
    await chrome.tabs.sendMessage(tabId, {
      type: 'EXPORT_INDEX_COMPLETE',
      requestId,
      totalPages: pages.length,
      totalChunks,
    });
  } catch (error) {
    console.warn('[Rewind.] Failed to deliver export completion notice:', error);
  }
}

// Flag to track initialization state
let isInitialized = false;
let initializationPromise: Promise<void> | null = null;

/**
 * Initialize the extension when installed or updated
 */
chrome.runtime.onInstalled.addListener(async (details) => {
  console.log('[Rewind.] Extension installed/updated:', details.reason);

  if (details.reason === 'install') {
    console.log('[Rewind.] First install - initializing...');

    // Initialize database
    try {
      console.log('[Rewind.] Initializing vector database...');
      await vectorStore.initialize();
      console.log('[Rewind.] Vector database initialized successfully');
    } catch (error) {
      console.error('[Rewind.] Failed to initialize database:', error);
    }

    // Initialize embedding service in background
    try {
      console.log('[Rewind.] Pre-loading EmbeddingGemma...');
      await embeddingGemmaService.initialize();
      const modelInfo = embeddingGemmaService.getModelInfo();
      console.log('[Rewind.] ✅ EmbeddingGemma loaded:', modelInfo.dimensions + 'd', modelInfo.parameters + ' params');
      console.log('[Rewind.] Quantized:', modelInfo.quantized, '| Normalized:', modelInfo.normalized);
    } catch (error) {
      console.error('[Rewind.] Failed to initialize EmbeddingGemma:', error);
    }

    // Set default configuration
    await chrome.storage.local.set({
      config: {
        dwellTimeThreshold: 10, // 10 seconds for faster testing
        maxIndexedPages: 20000,
        enableAutoIndexing: true,
        version: '1.0.0',
      },
    });

    console.log('[Rewind.] Initialization complete');
  } else if (details.reason === 'update') {
    console.log('[Rewind.] Extension updated from', details.previousVersion);
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
    console.log('[Rewind.] Already initialized, skipping...');
    return;
  }

  // If initialization is in progress, wait for it
  if (initializationPromise) {
    console.log('[Rewind.] Initialization already in progress, waiting...');
    await initializationPromise;
    return;
  }

  // Create and store the initialization promise
  initializationPromise = (async () => {
    console.log('[Rewind.] 🚀 Initializing Phase 3 components...');

  try {
    // Chrome AI API (for RAG Q&A) is optional - checked when needed
    console.log('[Rewind.] ✅ Ready to start indexing');

    // Initialize indexing queue
    console.log('[Rewind.] Initializing indexing queue...');
    await indexingQueue.initialize();

    // Clear any stale items from the queue (from tabs open before extension reload)
    const queueSize = indexingQueue.size();
    if (queueSize > 0) {
      console.log(`[Rewind.] Clearing ${queueSize} stale items from queue (from before extension reload)`);
      await indexingQueue.clear();
    }

    console.log('[Rewind.] ✅ Indexing queue ready');

    // Initialize indexing pipeline
    console.log('[Rewind.] Initializing indexing pipeline...');
    await indexingPipeline.initialize();
    console.log('[Rewind.] ✅ Indexing pipeline ready');

    // Initialize tab monitor with callback
    console.log('[Rewind.] Initializing tab monitor...');
    await tabMonitor.initialize(async (tabInfo) => {
      console.log('[Rewind.] 📄 Page loaded, queuing for indexing:', tabInfo.url);
      await indexingQueue.add(tabInfo);
      updateBadge();
    });
    console.log('[Rewind.] ✅ Tab monitor ready (indexing on page load)');

    // Start queue processor
    startQueueProcessor();
    console.log('[Rewind.] ✅ Queue processor started');

    console.log('[Rewind.] 🎉 Initialization complete!');
    console.log('[Rewind.] Ready to index pages with passage-based embeddings');

    // Mark as initialized
    isInitialized = true;
  } catch (error) {
    console.error('[Rewind.] ❌ Failed to initialize Phase 3:', error);
    throw error; // Re-throw to propagate to the promise
  }
  })();

  // Wait for initialization to complete
  await initializationPromise;
}

/**
 * Start the queue processor
 * NON-BLOCKING: Uses fire-and-forget pattern to keep service worker responsive
 */
function startQueueProcessor(): void {
  if (queueProcessor) {
    console.log('[Rewind.] Queue processor already running, skipping start');
    return;
  }

  queueProcessor = setInterval(() => {
    // Fire-and-forget: Don't await to keep service worker responsive
    processNextQueueItem().catch(err => {
      console.error('[Rewind.] ❌ Queue processor error:', err);
    });
  }, 500); // Check every 500ms

  console.log('[Rewind.] Queue processor started');
}

/**
 * Process next queue item (non-blocking async function)
 */
async function processNextQueueItem(): Promise<void> {
  // Skip if already processing
  if (indexingPipeline.isCurrentlyProcessing() || indexingQueue.isCurrentlyProcessing()) {
    return;
  }

  // Get next page from queue
  const next = await indexingQueue.getNext();
  if (!next) {
    return;
  }

  console.log('[Rewind.] 🔄 Processing queued page:', next.url);

  // Process the page with timeout (10s for better responsiveness)
  indexingQueue.setProcessing(true);
  
  try {
    // Create timeout that we can cancel
    let timeoutId: NodeJS.Timeout | null = null;
    
    const result = await Promise.race([
      indexingPipeline.processPage(next),
      new Promise<{ success: false; error: string }>((resolve) => {
        timeoutId = setTimeout(() => {
          console.warn('[Rewind.] ⏱️ Indexing timeout for:', next.url, '- skipping');
          resolve({ success: false, error: 'Timeout (10s) - skipped' });
        }, 10000); // 10 seconds
      })
    ]);

    // Cancel timeout if indexing completed before timeout
    if (timeoutId) {
      clearTimeout(timeoutId);
    }

    if (result.success) {
      await indexingQueue.markComplete(next.id);
      console.log('[Rewind.] ✅ Page indexed:', next.url);
    } else {
      await indexingQueue.markFailed(next.id, result.error || 'Unknown error');
      console.warn('[Rewind.] ⚠️ Skipped page:', next.url, '-', result.error);
    }
  } catch (error) {
    console.error('[Rewind.] ❌ Indexing error:', next.url, error);
    await indexingQueue.markFailed(next.id, (error as Error).message);
  } finally {
    indexingQueue.setProcessing(false);
    updateBadge();
  }
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
  console.log('[Rewind.] Browser started, extension active');

  // Reinitialize Phase 3 components on browser startup
  await initializePhase3();
});

/**
 * Run comprehensive search metrics test
 */
async function runSearchMetricsTest() {
  console.log('[Rewind.] 🧪 Starting search metrics test...');

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
    console.log(`[Rewind.] Testing query: "${query}"`);

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
            minSimilarity: 0.58,
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

          console.log(`[Rewind.] ${mode} (k=${k}): ${searchResults.length} results in ${searchTime.toFixed(2)}ms (avg sim: ${avgSimilarity.toFixed(3)})`);

          totalTests++;

        } catch (error) {
          console.error(`[Rewind.] Search failed for query "${query}" with mode ${mode}:`, error);
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
  const highQualityResults = validSimilarities.filter(s => s >= 0.68).length;
  const mediumQualityResults = validSimilarities.filter(s => s >= 0.58 && s < 0.68).length;
  const lowQualityResults = validSimilarities.filter(s => s < 0.58).length;

  // Calculate similarity distribution statistics
  const maxSimilarity = validSimilarities.length > 0 ? Math.max(...validSimilarities) : 0;
  const minSimilarity = validSimilarities.length > 0 ? Math.min(...validSimilarities) : 0;
  const medianSimilarity = validSimilarities.length > 0
    ? validSimilarities.sort((a, b) => a - b)[Math.floor(validSimilarities.length / 2)]
    : 0;

  // Check if threshold is being respected (only for semantic results)
  const thresholdRespected = validSimilarities.every(s => s >= 0.58);

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
    thresholdLevel: 0.58,
    // Enhanced similarity analysis
    maxSimilarity: parseFloat(maxSimilarity.toFixed(3)),
    minSimilarity: parseFloat(minSimilarity.toFixed(3)),
    medianSimilarity: parseFloat(medianSimilarity.toFixed(3)),
    totalSemanticResults: validSimilarities.length,
    avgSemanticSimilarity: validSimilarities.length > 0
      ? parseFloat((validSimilarities.reduce((a, b) => a + b, 0) / validSimilarities.length).toFixed(3))
      : 0
  };

  console.log('[Rewind.] 📊 Search metrics test completed:', { totalTests, avgSearchTime, thresholdRespected });

  return {
    results,
    summary
  };
}

/**
 * Create meaningful passages from content for better semantic search
 */
function createPassagesFromContent(content: string): Array<{
  id: string;
  text: string;
  wordCount: number;
  position: number;
  quality: number;
}> {
  const passages = [];

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
  console.log('[Rewind.] Received message:', message.type, 'from:', sender.tab?.id || 'popup');

  // Handle different message types
  switch (message.type) {
    case 'PING':
      sendResponse({ status: 'ok', timestamp: Date.now() });
      return false;

    case 'GET_STATUS':
      // Get status including database stats
      console.log('[Rewind.] GET_STATUS request received');
      vectorStore
        .getStats()
        .then((dbStats) => {
          const modelInfo = embeddingGemmaService.getModelInfo();
          const response = {
            initialized: embeddingGemmaService.isInitialized(),
            cacheStats: embeddingGemmaService.getCacheStats(),
            modelInfo,
            dbStats,
          };
          console.log('[Rewind.] Sending status response:', response);
          sendResponse(response);
        })
        .catch((error) => {
          console.error('[Rewind.] Failed to get stats:', error);
          const response = {
            initialized: embeddingGemmaService.isInitialized(),
            cacheStats: embeddingGemmaService.getCacheStats(),
            dbStats: null,
            error: error.message,
          };
          console.log('[Rewind.] Sending error response:', response);
          sendResponse(response);
        });
      return true; // Async response

    case 'GET_DB_STATS':
      // Get database statistics
      console.log('[Rewind.] GET_DB_STATS request received');
      vectorStore
        .getStats()
        .then((stats) => {
          console.log('[Rewind.] Sending DB stats:', stats);
          sendResponse({ success: true, stats });
        })
        .catch((error) => {
          console.error('[Rewind.] Failed to get DB stats:', error);
          sendResponse({ success: false, error: error.message });
        });
      return true;

    case 'GET_ALL_PAGES':
      // Get all pages (chronologically)
      console.log('[Rewind.] GET_ALL_PAGES request received');
      (async () => {
        const tabId = sender.tab?.id;
        if (typeof tabId !== 'number') {
          const errorMessage = 'GET_ALL_PAGES requires a tab context';
          console.warn('[Rewind.] Unable to stream pages - missing tab context');
          sendResponse({ success: false, error: errorMessage });
          return;
        }

        try {
          const pages = await vectorStore.getAllPageMetadata();
          console.log('[Rewind.] Retrieved metadata for', pages.length, 'pages');

          if (pages.length === 0) {
            sendResponse({ success: true, pages: [] });
            return;
          }

          if (pages.length <= HISTORY_CHUNK_SIZE) {
            sendResponse({ success: true, pages });
            return;
          }

          const requestId = crypto.randomUUID();
          sendResponse({
            success: true,
            chunked: true,
            requestId,
            total: pages.length,
            chunkSize: HISTORY_CHUNK_SIZE,
          });

          await streamPageMetadataToTab(tabId, requestId, pages);
        } catch (error) {
          console.error('[Rewind.] Failed to get all pages:', error);
          sendResponse({ success: false, error: (error as Error).message });
        }
      })();
      return true;

    case 'EXPORT_INDEX':
      console.log('[Rewind.] EXPORT_INDEX request received');
      (async () => {
        const tabId = sender.tab?.id;
        if (typeof tabId !== 'number') {
          const errorMessage = 'EXPORT_INDEX requires a tab context';
          console.warn('[Rewind.] Unable to export index - missing tab context');
          sendResponse({ success: false, error: errorMessage });
          return;
        }

        try {
          const pages = await vectorStore.getAllPages();
          console.log('[Rewind.] Retrieved', pages.length, 'pages for export');

          if (pages.length === 0) {
            sendResponse({ success: true, pages: [] });
            return;
          }

          if (pages.length <= EXPORT_CHUNK_SIZE) {
            sendResponse({ success: true, pages });
            return;
          }

          const requestId = crypto.randomUUID();
          sendResponse({
            success: true,
            chunked: true,
            requestId,
            total: pages.length,
            chunkSize: EXPORT_CHUNK_SIZE,
          });

          await streamPageRecordsToTab(tabId, requestId, pages);
        } catch (error) {
          console.error('[Rewind.] Failed to export index:', error);
          sendResponse({ success: false, error: (error as Error).message });
        }
      })();
      return true;

    case 'CLEAR_HISTORY':
      // Clear all history from IndexedDB
      console.log('[Rewind.] CLEAR_HISTORY request received');
      vectorStore
        .clearAll()
        .then(() => {
          console.log('[Rewind.] All history cleared successfully');
          // Also clear the indexing queue to remove stale items
          indexingQueue
            .clear()
            .then(() => {
              console.log('[Rewind.] Indexing queue cleared after history wipe');
            })
            .catch((queueError) => {
              console.error('[Rewind.] Failed to clear indexing queue:', queueError);
            });
          sendResponse({ success: true });
        })
        .catch((error) => {
          console.error('[Rewind.] Failed to clear history:', error);
          sendResponse({ success: false, error: error.message });
        });
      return true;

    
    case 'SEARCH_QUERY':
      // Perform hybrid search (semantic + keyword + RRF fusion)
      (async () => {
        try {
          const { query, options } = message;

          const searchResults = await hybridSearch.search(query, {
            mode: options?.mode || 'hybrid',
            ...options,
          });

          const resultsPayload = searchResults.map(result => ({
            id: result.page.id,
            url: result.page.url,
            title: result.page.title,
            content: result.page.content,
            similarity: result.similarity ?? null,
            relevanceScore: result.relevanceScore ?? null,
            keywordScore: result.keywordScore ?? null,
            confidence: result.confidence ?? 'low',
            matchedTerms: result.matchedTerms ?? [],
            topPassageSnippet: result.topPassageSnippet ?? null,
            timestamp: result.page.timestamp,
            dwellTime: result.page.dwellTime,
            lastAccessed: result.page.lastAccessed,
            visitCount: result.page.visitCount,
          }));

          sendResponse({ success: true, results: resultsPayload });
        } catch (error) {
          console.error('[Rewind.] Search failed:', error);
          sendResponse({ success: false, error: (error as Error).message });
        }
      })();
      return true;

    case 'ADD_TEST_PAGE':
      // Add a test page to the database (for development/testing)
      (async () => {
        try {
          const { url, title, content } = message;

          // Create passages from content (passage-only approach)
          const passages = createPassagesFromContent(content);

          // Add to database (no page/title/URL embeddings needed)
          const id = await vectorStore.addPage({
            url,
            title,
            content,
            passages,
            timestamp: Date.now(),
            dwellTime: 60,
            lastAccessed: 0,
            visitCount: 1,
          });

          sendResponse({ success: true, id });
        } catch (error) {
          console.error('[Rewind.] Failed to add test page:', error);
          sendResponse({ success: false, error: (error as Error).message });
        }
      })();
      return true;

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
      embeddingGemmaService
        .initialize()
        .then(() => {
          const modelInfo = embeddingGemmaService.getModelInfo();
          sendResponse({ success: true, modelInfo });
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
          console.error('[Rewind.] Failed to update lastAccessed:', error);
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
        console.log('[Rewind.] Indexing paused');
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
          // Also reset processing flag in case it's stuck
          indexingQueue.setProcessing(false);
          updateBadge();
          console.log('[Rewind.] Queue cleared and processing flag reset');
          sendResponse({ success: true });
        })
        .catch((error) => {
          sendResponse({ success: false, error: error.message });
        });
      return true;

  
    case 'RUN_SEARCH_METRICS_TEST':
      // Run comprehensive search metrics test
      (async () => {
        try {
          console.log('[Rewind.] Running search metrics test...');

          // Get database stats first
          const dbStats = await vectorStore.getStats();
          if (dbStats.totalPages === 0) {
            throw new Error('No indexed pages found. Please browse some websites first.');
          }

          const metrics = await runSearchMetricsTest();

          console.log('[Rewind.] Search metrics test completed:', metrics);
          sendResponse({ success: true, metrics });
        } catch (error) {
          console.error('[Rewind.] Search metrics test failed:', error);
          sendResponse({
            success: false,
            error: (error as Error).message,
          });
        }
      })();
      return true;


    case 'TEST_EMBEDDINGS':
      // Test embedding generation
      (async () => {
        try {
          const { text } = message;
          console.log('[Rewind.] Testing embeddings with:', { textLength: text.length });

          // Ensure embedding service is initialized
          await embeddingGemmaService.initialize();

          const startTime = performance.now();
          // Test both query and document embeddings
          const queryEmbedding = await embeddingGemmaService.generateEmbedding(text, 'query');
          const queryTime = performance.now() - startTime;
          
          const docStartTime = performance.now();
          const docEmbedding = await embeddingGemmaService.generateEmbedding(text, 'document');
          const docTime = performance.now() - docStartTime;

          const modelInfo = embeddingGemmaService.getModelInfo();

          console.log('[Rewind.] Embedding test successful:', {
            dimensions: queryEmbedding.length,
            queryTime: queryTime.toFixed(2),
            docTime: docTime.toFixed(2),
            model: modelInfo.name
          });

          sendResponse({
            success: true,
            queryEmbedding: Array.from(queryEmbedding).slice(0, 10), // First 10 dimensions for preview
            docEmbedding: Array.from(docEmbedding).slice(0, 10),
            dimensions: queryEmbedding.length,
            queryTime: Math.round(queryTime),
            docTime: Math.round(docTime),
            model: modelInfo.name,
            quantized: modelInfo.quantized,
            normalized: modelInfo.normalized
          });
        } catch (error) {
          console.error('[Rewind.] Embedding test failed:', error);
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
          console.log('[Rewind.] Testing hybrid search with queries:', queries);

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

          console.log('[Rewind.] Hybrid search test successful:', results);

          sendResponse({
            success: true,
            results
          });
        } catch (error) {
          console.error('[Rewind.] Hybrid search test failed:', error);
          sendResponse({
            success: false,
            error: (error as Error).message,
          });
        }
      })();
      return true;

    case 'PROMPT_RESPONSE':
      // Handle response from offscreen Prompt API
      console.log('[Rewind.] Received prompt response:', message.response.id);
      offscreenManager.handlePromptResponse(message.response);
      return false;

    case 'CONTENT_SCRIPT_READY':
      // Content script has loaded and is ready
      // This is just a notification, no action needed
      console.log('[Rewind.] Content script ready on tab:', sender.tab?.id);
      sendResponse({ status: 'ok' });
      return false;

    case 'CHECK_RAG_AVAILABILITY':
      // Check if RAG (Retrieval-Augmented Generation) is available
      (async () => {
        try {
          const available = await ragController.isAvailable();
          sendResponse({ available });
        } catch (error) {
          console.error('[Rewind.] Failed to check RAG availability:', error);
          sendResponse({ available: false });
        }
      })();
      return true; // Keep message channel open for async response

    case 'RAG_QUERY':
      // Answer a question using RAG
      (async () => {
        try {
          const { question, options } = message;
          const result = await ragController.answerQuestion(question, options);
          sendResponse({ success: true, result });
        } catch (error) {
          console.error('[Rewind.] RAG query failed:', error);
          sendResponse({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      })();
      return true; // Keep message channel open for async response

    default:
      console.warn('[Rewind.] Unknown message type:', message.type);
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
  console.log('[Rewind.] Service worker keepalive ping');
}, KEEP_ALIVE_INTERVAL);

/**
 * Handle keyboard commands
 */
chrome.commands.onCommand.addListener(async (command) => {
  if (command === 'toggle-sidebar') {
    console.log('[Rewind.] Keyboard shortcut (Cmd+Shift+E) triggered from background');
    await toggleSidebarOnActiveTab();
  }
});

/**
 * Handle extension icon click
 */
chrome.action.onClicked.addListener(async (tab) => {
  console.log('[Rewind.] ===== EXTENSION ICON CLICKED =====');
  console.log('[Rewind.] Clicked tab:', { id: tab.id, url: tab.url, title: tab.title });
  try {
    await toggleSidebarOnActiveTab();
    console.log('[Rewind.] ===== ICON CLICK HANDLED SUCCESSFULLY =====');
  } catch (error) {
    console.error('[Rewind.] ===== ICON CLICK FAILED =====', error);
  }
});

/**
 * Toggle sidebar on the active tab
 * Shared logic for both keyboard shortcut and icon click
 */
async function toggleSidebarOnActiveTab(): Promise<void> {
  try {
    console.log('[Rewind.] toggleSidebarOnActiveTab() called');
    
    // Get active tab
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    console.log('[Rewind.] Query returned tabs:', tabs.length);
    const activeTab = tabs[0];

    if (!activeTab?.id) {
      console.warn('[Rewind.] ❌ No active tab found');
      return;
    }

    console.log('[Rewind.] Active tab:', { id: activeTab.id, url: activeTab.url, title: activeTab.title });

    // Check if this is a restricted page
    if (activeTab.url?.startsWith('chrome://') ||
        activeTab.url?.startsWith('chrome-extension://') ||
        activeTab.url?.startsWith('edge://')) {
      console.warn('[Rewind.] ❌ Cannot run on restricted pages (chrome://, chrome-extension://, etc)');
      return;
    }

    console.log('[Rewind.] 📤 Sending TOGGLE_SIDEBAR to tab:', activeTab.id);

    // Try to send message to content script
    try {
      const response = await chrome.tabs.sendMessage(activeTab.id, { type: 'TOGGLE_SIDEBAR' });
      console.log('[Rewind.] ✅ TOGGLE_SIDEBAR message sent successfully, response:', response);
    } catch (error: any) {
      console.error('[Rewind.] ❌ Error sending TOGGLE_SIDEBAR:', error);
      if (error.message?.includes('Could not establish connection') ||
          error.message?.includes('Receiving end does not exist')) {
        console.error('[Rewind.] 💡 Content script not loaded. This usually means:');
        console.error('[Rewind.]    1. The page was loaded before the extension was installed/updated');
        console.error('[Rewind.]    2. The page blocks content scripts (chrome:// pages, etc)');
        console.error('[Rewind.]    3. Try refreshing the page (F5 or Cmd+R)');
        
        // Try to inject content script manually if not loaded
        console.log('[Rewind.] Attempting to manually inject content script...');
        try {
          await chrome.scripting.executeScript({
            target: { tabId: activeTab.id },
            files: ['assets/index.ts-loader-eNwBVaYy.js']
          });
          console.log('[Rewind.] ✅ Content script injected, retrying toggle...');
          // Wait a bit for script to initialize
          await new Promise(resolve => setTimeout(resolve, 500));
          // Retry sending message
          await chrome.tabs.sendMessage(activeTab.id, { type: 'TOGGLE_SIDEBAR' });
          console.log('[Rewind.] ✅ TOGGLE_SIDEBAR sent after manual injection');
        } catch (injectError) {
          console.error('[Rewind.] ❌ Failed to inject content script:', injectError);
        }
      } else {
        throw error;
      }
    }
  } catch (error) {
    console.error('[Rewind.] ❌ Fatal error toggling sidebar:', error);
  }
}

console.log('[Rewind.] Background service worker ready');

// Initialize Phase 3 components immediately when service worker starts
// This ensures initialization happens even when extension is reloaded during development
initializePhase3().catch((error) => {
  console.error('[Rewind.] Failed to initialize on service worker start:', error);
});
