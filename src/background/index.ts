/**
 * Memex Background Service Worker
 * Handles extension lifecycle and coordinates background tasks
 */

import { embeddingService } from '../lib/embeddings/EmbeddingService';
import { vectorStore } from '../lib/storage/VectorStore';
import { vectorSearch } from '../lib/search/VectorSearch';
import { hybridSearch } from '../lib/search/HybridSearch';
import { summarizerService } from '../lib/summarizer/SummarizerService';
import { TabMonitor } from './TabMonitor';
import { indexingQueue } from './IndexingQueue';
import { indexingPipeline } from './IndexingPipeline';
import { TEST_PAGES } from '../utils/testData';
import { TEST_PAGES as EVAL_TEST_PAGES, EVAL_QUERIES } from '../utils/evalData';

console.log('[Memex] Background service worker started');

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
  console.log('[Memex] Extension installed/updated:', details.reason);

  if (details.reason === 'install') {
    console.log('[Memex] First install - initializing...');

    // Initialize database
    try {
      console.log('[Memex] Initializing vector database...');
      await vectorStore.initialize();
      console.log('[Memex] Vector database initialized successfully');
    } catch (error) {
      console.error('[Memex] Failed to initialize database:', error);
    }

    // Initialize embedding service in background
    try {
      console.log('[Memex] Pre-loading embedding model...');
      await embeddingService.initialize();
      console.log('[Memex] Embedding model loaded successfully');
    } catch (error) {
      console.error('[Memex] Failed to initialize embedding model:', error);
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

    console.log('[Memex] Initialization complete');
  } else if (details.reason === 'update') {
    console.log('[Memex] Extension updated from', details.previousVersion);
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
    console.log('[Memex] Already initialized, skipping...');
    return;
  }

  // If initialization is in progress, wait for it
  if (initializationPromise) {
    console.log('[Memex] Initialization already in progress, waiting...');
    await initializationPromise;
    return;
  }

  // Create and store the initialization promise
  initializationPromise = (async () => {
    console.log('[Memex] 🚀 Initializing Phase 3 components...');

  try {
    // Initialize indexing queue
    console.log('[Memex] Initializing indexing queue...');
    await indexingQueue.initialize();
    console.log('[Memex] ✅ Indexing queue ready');

    // Initialize indexing pipeline
    console.log('[Memex] Initializing indexing pipeline...');
    await indexingPipeline.initialize();
    console.log('[Memex] ✅ Indexing pipeline ready');

    // Initialize summarizer service
    console.log('[Memex] Initializing summarizer service...');
    await summarizerService.initialize();
    console.log('[Memex] ✅ Summarizer service ready');

    // Initialize tab monitor with callback
    console.log('[Memex] Initializing tab monitor...');
    await tabMonitor.initialize(async (tabInfo) => {
      console.log('[Memex] 📄 Page loaded, queuing for indexing:', tabInfo.url);
      await indexingQueue.add(tabInfo);
      updateBadge();
    });
    console.log('[Memex] ✅ Tab monitor ready (indexing on page load)');

    // Start queue processor
    startQueueProcessor();
    console.log('[Memex] ✅ Queue processor started');

    console.log('[Memex] 🎉 Phase 3 initialized successfully!');
    console.log('[Memex] Ready to index pages immediately on load');
    
    // Mark as initialized
    isInitialized = true;
  } catch (error) {
    console.error('[Memex] ❌ Failed to initialize Phase 3:', error);
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
    console.log('[Memex] Queue processor already running, skipping start');
    return;
  }

  queueProcessor = setInterval(async () => {
    // Skip if already processing
    if (indexingPipeline.isCurrentlyProcessing() || indexingQueue.isCurrentlyProcessing()) {
      console.log('[Memex] 🔄 Queue processor: Skipping, already processing');
      return;
    }

    // Get next page from queue
    const next = await indexingQueue.getNext();
    if (!next) {
      return;
    }

    console.log('[Memex] 🔄 Processing queued page:', next.url);

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

  console.log('[Memex] Queue processor started');
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
  console.log('[Memex] Browser started, extension active');

  // Reinitialize Phase 3 components on browser startup
  await initializePhase3();
});

/**
 * Handle messages from other parts of the extension
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('[Memex] Received message:', message.type, 'from:', sender.tab?.id || 'popup');

  // Handle different message types
  switch (message.type) {
    case 'PING':
      sendResponse({ status: 'ok', timestamp: Date.now() });
      return false;

    case 'GET_STATUS':
      // Get status including database stats
      console.log('[Memex] GET_STATUS request received');
      vectorStore
        .getStats()
        .then((dbStats) => {
          const response = {
            initialized: embeddingService.isInitialized(),
            cacheStats: embeddingService.getCacheStats(),
            dbStats,
          };
          console.log('[Memex] Sending status response:', response);
          sendResponse(response);
        })
        .catch((error) => {
          console.error('[Memex] Failed to get stats:', error);
          const response = {
            initialized: embeddingService.isInitialized(),
            cacheStats: embeddingService.getCacheStats(),
            dbStats: null,
            error: error.message,
          };
          console.log('[Memex] Sending error response:', response);
          sendResponse(response);
        });
      return true; // Async response

    case 'GET_DB_STATS':
      // Get database statistics
      console.log('[Memex] GET_DB_STATS request received');
      vectorStore
        .getStats()
        .then((stats) => {
          console.log('[Memex] Sending DB stats:', stats);
          sendResponse({ success: true, stats });
        })
        .catch((error) => {
          console.error('[Memex] Failed to get DB stats:', error);
          sendResponse({ success: false, error: error.message });
        });
      return true;

    case 'GET_ALL_PAGES':
      // Get all pages (chronologically)
      console.log('[Memex] GET_ALL_PAGES request received');
      vectorStore
        .getAllPages()
        .then((pages) => {
          console.log('[Memex] Sending', pages.length, 'pages');
          sendResponse({ success: true, pages });
        })
        .catch((error) => {
          console.error('[Memex] Failed to get all pages:', error);
          sendResponse({ success: false, error: error.message });
        });
      return true;

    case 'CLEAR_HISTORY':
      // Clear all history from IndexedDB
      console.log('[Memex] CLEAR_HISTORY request received');
      vectorStore
        .clearAll()
        .then(() => {
          console.log('[Memex] All history cleared successfully');
          // Also clear the indexing queue to remove stale items
          indexingQueue
            .clear()
            .then(() => {
              console.log('[Memex] Indexing queue cleared after history wipe');
            })
            .catch((queueError) => {
              console.error('[Memex] Failed to clear indexing queue:', queueError);
            });
          sendResponse({ success: true });
        })
        .catch((error) => {
          console.error('[Memex] Failed to clear history:', error);
          sendResponse({ success: false, error: error.message });
        });
      return true;

    case 'POPULATE_TEST_DATA':
      // Populate database with test data for evaluation
      console.log('[Memex] POPULATE_TEST_DATA request received');
      (async () => {
        try {
          console.log(`[Memex] 🧪 Populating ${TEST_PAGES.length} test pages...`);

          let successCount = 0;
          let failCount = 0;

          for (let i = 0; i < TEST_PAGES.length; i++) {
            const page = TEST_PAGES[i];
            try {
              console.log(`[Memex] 🧪 [${i + 1}/${TEST_PAGES.length}] Processing: ${page.title}`);

              // Generate embedding
              const embedding = await embeddingService.generateEmbedding(
                page.title + ' ' + page.summary
              );

              // Store in database
              await vectorStore.addPage({
                url: page.url,
                title: page.title,
                content: page.content,
                summary: page.summary,
                embedding: embedding,
                timestamp: Date.now() - (TEST_PAGES.length - i) * 60000, // Stagger timestamps
                lastAccessed: Date.now() - (TEST_PAGES.length - i) * 60000,
                dwellTime: 15000 + Math.random() * 30000,
              });

              successCount++;
              console.log(`[Memex] 🧪 ✅ [${i + 1}/${TEST_PAGES.length}] Stored: ${page.title}`);
            } catch (error) {
              failCount++;
              console.error(`[Memex] 🧪 ❌ Failed to process: ${page.title}`, error);
            }
          }

          console.log(
            `[Memex] 🧪 ✨ Test data population complete! Success: ${successCount}, Failed: ${failCount}`
          );
          sendResponse({
            success: true,
            stats: { total: TEST_PAGES.length, success: successCount, failed: failCount },
          });
        } catch (error) {
          console.error('[Memex] 🧪 Failed to populate test data:', error);
          sendResponse({ success: false, error: (error as Error).message });
        }
      })();
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
          console.error('[Memex] Search failed:', error);
          sendResponse({ success: false, error: (error as Error).message });
        }
      })();
      return true;

    case 'ADD_TEST_PAGE':
      // Add a test page to the database (for development/testing)
      (async () => {
        try {
          const { url, title, content, summary } = message;

          // Generate embedding
          const embedding = await embeddingService.generateEmbedding(summary);

          // Add to database
          const id = await vectorStore.addPage({
            url,
            title,
            content,
            summary,
            embedding,
            timestamp: Date.now(),
            dwellTime: 60,
            lastAccessed: 0,
          });

          sendResponse({ success: true, id });
        } catch (error) {
          console.error('[Memex] Failed to add test page:', error);
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
          console.error('[Memex] Failed to update lastAccessed:', error);
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
        console.log('[Memex] Indexing paused');
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

    case 'GET_EVAL_DATA':
      // Return eval data for chrome-eval.html
      sendResponse({
        success: true,
        testPages: EVAL_TEST_PAGES,
        queries: EVAL_QUERIES,
      });
      return false;

    case 'RUN_EVAL':
      // Run evaluation suite in Chrome context (tests real Summarizer API!)
      (async () => {
        try {
          const { testPages, queries } = message;
          console.log(`[Memex Eval] 🧪 Running eval with ${testPages.length} pages, ${queries.length} queries`);

          // Clear existing data
          console.log('[Memex Eval] Clearing database...');
          await vectorStore.clearAll();

          // Track Summarizer API usage
          const summarizerAvailable = summarizerService.isAIApiAvailable();
          console.log('[Memex Eval] Summarizer API available:', summarizerAvailable);

          // Index test pages using REAL pipeline with sharedContext!
          console.log('[Memex Eval] Indexing pages...');
          const indexingResults = [];

          for (let i = 0; i < testPages.length; i++) {
            const page = testPages[i];
            const startTime = Date.now();

            try {
              // Use summarizeForSearch which includes sharedContext
              const summary = await summarizerService.summarizeForSearch(
                page.content,
                page.url,
                page.title,
                800
              );

              // Generate embedding from title + summary (matching production)
              const embeddingText = `${page.title}. ${summary}`;
              const embedding = await embeddingService.generateEmbedding(embeddingText);

              // Store in database
              await vectorStore.addPage({
                url: page.url,
                title: page.title,
                content: page.content,
                summary,
                embedding,
                timestamp: Date.now() - (testPages.length - i) * 60000,
                dwellTime: 60,
                lastAccessed: 0,
              });

              const duration = Date.now() - startTime;
              indexingResults.push({
                url: page.url,
                success: true,
                duration,
                summaryLength: summary.length,
              });

              console.log(`[Memex Eval] ✅ [${i + 1}/${testPages.length}] Indexed: ${page.title.substring(0, 50)} (${duration}ms)`);
            } catch (error) {
              const duration = Date.now() - startTime;
              indexingResults.push({
                url: page.url,
                success: false,
                error: (error as Error).message,
                duration,
              });
              console.error(`[Memex Eval] ❌ [${i + 1}/${testPages.length}] Failed: ${page.title}`, error);
            }
          }

          // Run queries
          console.log('[Memex Eval] Running queries...');
          const queryResults = [];

          for (const evalQuery of queries) {
            const startTime = Date.now();

            try {
              // Generate query embedding
              const queryEmbedding = await embeddingService.generateEmbedding(evalQuery.query);

              // Search
              const searchResults = await vectorSearch.search(queryEmbedding, { k: 10 });

              const duration = Date.now() - startTime;

              queryResults.push({
                query: evalQuery.query,
                description: evalQuery.description,
                expectedUrls: evalQuery.expectedUrls,
                relevance: evalQuery.relevance,
                results: searchResults.map(r => ({
                  url: r.page.url,
                  title: r.page.title,
                  similarity: r.similarity,
                })),
                duration,
              });

              console.log(`[Memex Eval] ✅ Query: "${evalQuery.query}" (${duration}ms, ${searchResults.length} results)`);
            } catch (error) {
              queryResults.push({
                query: evalQuery.query,
                error: (error as Error).message,
              });
              console.error(`[Memex Eval] ❌ Query failed: "${evalQuery.query}"`, error);
            }
          }

          console.log('[Memex Eval] 🎉 Eval complete!');

          sendResponse({
            success: true,
            summarizerAvailable,
            indexingResults,
            queryResults,
          });
        } catch (error) {
          console.error('[Memex Eval] ❌ Eval failed:', error);
          sendResponse({ success: false, error: (error as Error).message });
        }
      })();
      return true;

    default:
      console.warn('[Memex] Unknown message type:', message.type);
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
  console.log('[Memex] Service worker keepalive ping');
}, KEEP_ALIVE_INTERVAL);

/**
 * Handle keyboard commands
 */
chrome.commands.onCommand.addListener((command) => {
  if (command === 'toggle-sidebar') {
    console.log('[Memex] Keyboard shortcut triggered');
    
    // Send message to active tab to toggle sidebar
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]?.id) {
        chrome.tabs.sendMessage(tabs[0].id, { type: 'TOGGLE_SIDEBAR' })
          .catch((error) => {
            console.error('[Memex] Error toggling sidebar:', error);
          });
      }
    });
  }
});

console.log('[Memex] Background service worker ready');

// Initialize Phase 3 components immediately when service worker starts
// This ensures initialization happens even when extension is reloaded during development
initializePhase3().catch((error) => {
  console.error('[Memex] Failed to initialize on service worker start:', error);
});
