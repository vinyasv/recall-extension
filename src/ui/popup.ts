/**
 * Rewind. Popup - Enhanced UI with testing capabilities
 */

console.log('[Rewind. Popup] Initializing enhanced popup...');

// DOM Elements
const statusEl = document.getElementById('status') as HTMLDivElement;
const chromeAiStatusEl = document.getElementById('chromeAiStatus') as HTMLDivElement;
const aiStatusBadgeEl = document.getElementById('aiStatusBadge') as HTMLSpanElement;
const aiStatusDetailsEl = document.getElementById('aiStatusDetails') as HTMLDivElement;
const toggleSidebarBtn = document.getElementById('toggleSidebar') as HTMLButtonElement;
const showStatsBtn = document.getElementById('showStats') as HTMLButtonElement;
const testAIBtn = document.getElementById('testAI') as HTMLButtonElement;
const testEmbeddingsBtn = document.getElementById('testEmbeddings') as HTMLButtonElement;
const testSearchBtn = document.getElementById('testSearch') as HTMLButtonElement;
const testHybridSearchBtn = document.getElementById('testHybridSearch') as HTMLButtonElement;
const addTestDataBtn = document.getElementById('addTestData') as HTMLButtonElement;
const clearDataBtn = document.getElementById('clearData') as HTMLButtonElement;

// Pipeline status elements
const indexingStatusEl = document.getElementById('indexingStatus') as HTMLSpanElement;
const queueSizeEl = document.getElementById('queueSize') as HTMLSpanElement;
const lastProcessedEl = document.getElementById('lastProcessed') as HTMLSpanElement;

// AI metrics elements
const totalSummariesEl = document.getElementById('totalSummaries') as HTMLSpanElement;
const summarySuccessRateEl = document.getElementById('summarySuccessRate') as HTMLSpanElement;
const avgSummaryTimeEl = document.getElementById('avgSummaryTime') as HTMLSpanElement;
const apiTypeEl = document.getElementById('apiType') as HTMLSpanElement;
const lastSummaryTimeEl = document.getElementById('lastSummaryTime') as HTMLSpanElement;

/**
 * Show status message
 */
function showStatus(message: string, type: 'success' | 'error' | 'info' = 'info', persistent: boolean = false): void {
  if (!statusEl) return;

  // Clear any existing timeout
  if ((statusEl as any)._statusTimeout) {
    clearTimeout((statusEl as any)._statusTimeout);
    (statusEl as any)._statusTimeout = null;
  }

  // Don't clear persistent status unless explicitly requested
  if ((statusEl as any)._isPersistent && !persistent) {
    console.log('[Rewind. Popup] Not clearing persistent status');
    return;
  }

  statusEl.textContent = message;
  statusEl.className = `status ${type}`;

  // Add clear button for persistent messages (errors and evaluation results)
  if (persistent || type === 'error') {
    // Remove existing clear button if any
    const existingBtn = statusEl.querySelector('.clear-status');
    if (existingBtn) {
      existingBtn.remove();
    }

    // Add clear button
    const clearBtn = document.createElement('button');
    clearBtn.className = 'clear-status';
    clearBtn.textContent = '×';
    clearBtn.title = 'Clear status';
    clearBtn.addEventListener('click', () => {
      statusEl.textContent = '';
      statusEl.className = 'status';
      (statusEl as any)._isPersistent = false;
      if ((statusEl as any)._statusTimeout) {
        clearTimeout((statusEl as any)._statusTimeout);
        (statusEl as any)._statusTimeout = null;
      }
    });

    statusEl.appendChild(clearBtn);

    // Mark as persistent to prevent auto-clearing
    (statusEl as any)._isPersistent = true;

    console.log('[Rewind. Popup] Showing persistent status:', type);
  } else {
    // Mark as non-persistent
    (statusEl as any)._isPersistent = false;

    // Auto-hide non-persistent messages after 10 seconds (increased from 5)
    (statusEl as any)._statusTimeout = setTimeout(() => {
      // Only clear if not marked as persistent
      if (!(statusEl as any)._isPersistent) {
        statusEl.textContent = '';
        statusEl.className = 'status';
      }
    }, 10000);

    console.log('[Rewind. Popup] Showing temporary status:', type);
  }
}

/**
 * Update Chrome AI status indicator
 */
function updateChromeAIStatus(available: boolean, details?: string): void {
  if (!aiStatusBadgeEl || !aiStatusDetailsEl) return;

  if (available) {
    aiStatusBadgeEl.className = 'status-badge available';
    aiStatusBadgeEl.textContent = 'Available';
    aiStatusDetailsEl.textContent = details || 'Chrome Summarizer API is ready for use';
  } else {
    aiStatusBadgeEl.className = 'status-badge unavailable';
    aiStatusBadgeEl.textContent = 'Unavailable';
    aiStatusDetailsEl.textContent = details || 'Chrome Summarizer API not available (requires Chrome 138+ with Gemini Nano)';
  }
}

/**
 * Update pipeline status display
 */
function updatePipelineStatus(status: { indexing: string; queueSize: number; lastProcessed: string }): void {
  if (indexingStatusEl) {
    indexingStatusEl.className = `status-value ${status.indexing}`;
    indexingStatusEl.textContent = status.indexing.charAt(0).toUpperCase() + status.indexing.slice(1);
  }

  if (queueSizeEl) {
    queueSizeEl.textContent = status.queueSize.toString();
  }

  if (lastProcessedEl) {
    lastProcessedEl.textContent = status.lastProcessed;
  }
}

/**
 * Check pipeline status
 */
async function checkPipelineStatus(): Promise<void> {
  try {
    const response = await chrome.runtime.sendMessage({ type: 'GET_QUEUE_STATUS' });

    if (response?.success) {
      updatePipelineStatus({
        indexing: response.status?.isProcessing ? 'processing' : 'idle',
        queueSize: response.status?.queueSize || 0,
        lastProcessed: response.status?.lastProcessed
          ? new Date(response.status.lastProcessed).toLocaleTimeString()
          : 'Never'
      });
    } else {
      updatePipelineStatus({
        indexing: 'error',
        queueSize: 0,
        lastProcessed: 'Error'
      });
    }
  } catch (error) {
    console.error('[Rewind. Popup] Error checking pipeline status:', error);
    updatePipelineStatus({
      indexing: 'error',
      queueSize: 0,
      lastProcessed: 'Connection Error'
    });
  }
}

/**
 * Update AI metrics display
 */
function updateAIMetrics(metrics: {
  totalSummaries: number;
  successCount: number;
  failureCount: number;
  avgTime: number;
  apiType: 'chrome-ai' | 'fallback';
  lastSummaryTime: number;
}): void {
  if (totalSummariesEl) {
    totalSummariesEl.textContent = metrics.totalSummaries.toString();
  }

  if (summarySuccessRateEl) {
    const successRate = metrics.totalSummaries > 0
      ? (metrics.successCount / metrics.totalSummaries * 100).toFixed(1)
      : '0.0';
    summarySuccessRateEl.textContent = `${successRate}%`;
  }

  if (avgSummaryTimeEl) {
    avgSummaryTimeEl.textContent = `${metrics.avgTime.toFixed(0)}ms`;
  }

  if (apiTypeEl) {
    apiTypeEl.className = `status-value ${metrics.apiType}`;
    apiTypeEl.textContent = metrics.apiType === 'chrome-ai' ? 'Chrome AI' : 'Fallback';
  }

  if (lastSummaryTimeEl) {
    lastSummaryTimeEl.textContent = new Date(metrics.lastSummaryTime).toLocaleTimeString();
  }
}

/**
 * Load AI metrics from storage
 */
async function loadAIMetrics(): Promise<void> {
  try {
    const result = await chrome.storage.local.get(['aiMetrics']);
    const metrics = result.aiMetrics || {
      totalSummaries: 0,
      successCount: 0,
      failureCount: 0,
      avgTime: 0,
      apiType: 'chrome-ai' as const,
      lastSummaryTime: 0
    };

    updateAIMetrics(metrics);
  } catch (error) {
    console.error('[Rewind. Popup] Failed to load AI metrics:', error);
  }
}

/**
 * Save AI metrics to storage
 */
async function saveAIMetrics(metrics: {
  totalSummaries: number;
  successCount: number;
  failureCount: number;
  avgTime: number;
  apiType: 'chrome-ai' | 'fallback';
  lastSummaryTime: number;
}): Promise<void> {
  try {
    await chrome.storage.local.set({ aiMetrics: metrics });
  } catch (error) {
    console.error('[Rewind. Popup] Failed to save AI metrics:', error);
  }
}

/**
 * Check Chrome AI availability
 */
async function checkChromeAIAvailability(): Promise<void> {
  if (!aiStatusBadgeEl || !aiStatusDetailsEl) return;

  try {
    // Test Chrome Summarizer API availability
    const response = await chrome.runtime.sendMessage({
      type: 'TEST_SUMMARIZER',
      text: 'This is a simple test to check if the Chrome Summarizer API is available and working properly.',
      url: 'chrome://new-tab',
      title: 'Chrome AI Test',
      maxLength: 50
    });

    if (response?.success) {
      updateChromeAIStatus(true, `API: ${response.apiType || 'Chrome Summarizer'} - Working`);
    } else {
      updateChromeAIStatus(false, response?.error || 'API test failed');
    }
  } catch (error) {
    console.error('[Rewind. Popup] Error checking Chrome AI:', error);
    updateChromeAIStatus(false, `Connection error: ${(error as Error).message}`);
  }
}

/**
 * Set button loading state
 */
function setButtonLoading(button: HTMLButtonElement, loading: boolean): void {
  button.disabled = loading;
  if (loading) {
    // Store original text if not already stored
    if (!(button as any)._originalText) {
      (button as any)._originalText = button.textContent;
    }
    button.textContent = button.textContent?.replace(/🤖|🔍|🗑️|📝|⚡/, '⏳') || 'Loading...';
  } else {
    // Restore original text
    const originalText = (button as any)._originalText;
    if (originalText) {
      button.textContent = originalText;
    } else {
      // Fallback to hardcoded text
      if (button.id === 'testAI') button.textContent = '🤖 Test AI Summarizer';
      if (button.id === 'testEmbeddings') button.textContent = '⚡ Test Embeddings';
      if (button.id === 'testSearch') button.textContent = '🔍 Search Metrics Test';
      if (button.id === 'testHybridSearch') button.textContent = '⚡ Test Hybrid Search';
      if (button.id === 'addTestData') button.textContent = '📝 Add Test Data';
      if (button.id === 'clearData') button.textContent = '🗑️ Clear All Data';
    }
  }
}

/**
 * Get current active tab
 */
async function getCurrentTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

/**
 * Check if current tab can be used for content script operations
 */
async function canUseContentScript(): Promise<boolean> {
  const tab = await getCurrentTab();
  if (!tab?.id || !tab?.url) return false;

  // Skip restricted pages
  const restricted = [
    'chrome://',
    'chrome-extension://',
    'about:',
    'edge://',
    'moz-extension://',
    'safari-extension://'
  ];

  return !restricted.some(prefix => tab.url!.startsWith(prefix));
}

/**
 * Toggle sidebar on current page
 */
async function toggleSidebar(): Promise<void> {
  try {
    const tab = await getCurrentTab();
    if (!tab?.id) {
      showStatus('No active tab found', 'error');
      return;
    }

    const tabUrl = tab.url || '';

    // Check if this is a restricted page
    if (tabUrl.startsWith('chrome://') ||
        tabUrl.startsWith('chrome-extension://') ||
        tabUrl.startsWith('about:') ||
        tabUrl.startsWith('edge://')) {
      showStatus('Cannot open on browser pages\nTry a regular website', 'error');
      return;
    }

    showStatus('Opening sidebar...', 'info');

    // Send message with timeout
    const response = await Promise.race([
      chrome.tabs.sendMessage(tab.id, { type: 'TOGGLE_SIDEBAR' }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Timeout')), 2000)
      )
    ]);

    console.log('[Rewind. Popup] Sidebar toggled successfully:', response);
    showStatus('Sidebar opened successfully!', 'success', true);

    // Small delay before closing so sidebar can open
    setTimeout(() => {
      window.close();
    }, 500);

  } catch (error) {
    console.error('[Rewind. Popup] Error toggling sidebar:', error);
    showStatus(`Failed to open sidebar\nTry keyboard shortcut: ⌘⇧E`, 'error');
  }
}

/**
 * Show database statistics
 */
async function showStats(): Promise<void> {
  try {
    showStatus('Getting database stats...', 'info');

    const response = await chrome.runtime.sendMessage({ type: 'GET_DB_STATS' });

    if (!response || response.error) {
      throw new Error(response?.error || 'Failed to get stats');
    }

    const stats = response.stats;
    const message = `📊 Database Statistics\n\n` +
      `Pages: ${stats.totalPages}\n` +
      `Size: ${(stats.sizeBytes / 1024 / 1024).toFixed(2)} MB\n` +
      `Oldest: ${new Date(stats.oldestTimestamp).toLocaleDateString()}\n` +
      `Newest: ${new Date(stats.newestTimestamp).toLocaleDateString()}\n` +
      `Last Accessed: ${stats.lastAccessedTimestamp ? new Date(stats.lastAccessedTimestamp).toLocaleDateString() : 'Never'}`;

    showStatus(message, 'success', true);

  } catch (error) {
    console.error('[Rewind. Popup] Error getting stats:', error);
    showStatus(`Failed to get stats: ${error}`, 'error');
  }
}

/**
 * Test Chrome Summarizer API with real page content
 */
async function testAI(): Promise<void> {
  if (!await canUseContentScript()) {
    showStatus('Cannot test on this page\nTry a regular website', 'error');
    return;
  }

  setButtonLoading(testAIBtn, true);
  const startTime = Date.now();

  try {
    showStatus('Extracting page content...', 'info');

    // Get current tab info
    const tab = await getCurrentTab();
    if (!tab?.id || !tab?.url) {
      throw new Error('No active tab found');
    }

    // Extract content from current page
    const extractResponse = await chrome.tabs.sendMessage(tab.id, {
      type: 'EXTRACT_CONTENT'
    });

    if (!extractResponse?.success || !extractResponse.data?.content) {
      throw new Error('Failed to extract page content. Try a different page.');
    }

    const pageContent = extractResponse.data.content;
    const pageTitle = extractResponse.data.title || tab.url;
    const pageUrl = tab.url;

    showStatus('Testing Chrome Summarizer API...', 'info');

    // Test summarizer with real page content
    // First ensure user activation by clicking, then test summarizer
    console.log('[Rewind. Popup] Sending TEST_SUMMARIZER request...', {
      textLength: pageContent.length,
      url: pageUrl,
      title: pageTitle,
      maxLength: 300
    });

    const response = await chrome.runtime.sendMessage({
      type: 'TEST_SUMMARIZER',
      text: pageContent,
      url: pageUrl,
      title: pageTitle,
      maxLength: 300
    });

    console.log('[Rewind. Popup] Received TEST_SUMMARIZER response:', response);

    if (!response?.success) {
      console.error('[Rewind. Popup] TEST_SUMMARIZER failed:', {
        success: response?.success,
        error: response?.error,
        summary: response?.summary,
        apiType: response?.apiType
      });
      throw new Error(response?.error || 'Summarizer test failed');
    }

    const summary = response.summary;
    const contentPreview = pageContent.substring(0, 200) + (pageContent.length > 200 ? '...' : '');
    const processingTime = Date.now() - startTime;

    // Update AI metrics
    try {
      const result = await chrome.storage.local.get(['aiMetrics']);
      const metrics = result.aiMetrics || {
        totalSummaries: 0,
        successCount: 0,
        failureCount: 0,
        avgTime: 0,
        apiType: 'chrome-ai' as const,
        lastSummaryTime: 0
      };

      // Update metrics
      metrics.totalSummaries++;
      metrics.successCount++;
      metrics.failureCount = metrics.failureCount || 0;
      metrics.lastSummaryTime = Date.now();

      // Calculate new average time
      if (metrics.totalSummaries > 0) {
        metrics.avgTime = (metrics.avgTime * (metrics.totalSummaries - 1) + processingTime) / metrics.totalSummaries;
      }

      // Determine API type
      metrics.apiType = response.apiType?.includes('Chrome') ? 'chrome-ai' : 'fallback';

      updateAIMetrics(metrics);
      await saveAIMetrics(metrics);
    } catch (error) {
      console.error('[Rewind. Popup] Failed to update AI metrics:', error);
    }

    const message = `✅ AI Summarizer Working!\n\n` +
      `Page: ${pageTitle}\n` +
      `Original: ${pageContent.length} chars\n` +
      `Summary: ${summary.length} chars\n` +
      `API: ${response.apiType}\n` +
      `Processing Time: ${processingTime}ms\n\n` +
      `Page Content Preview:\n"${contentPreview}"\n\n` +
      `Generated Summary:\n"${summary}"`;

    showStatus(message, 'success', true);

  } catch (error) {
    console.error('[Rewind. Popup] Error testing AI:', error);

    // Provide more helpful error messages
    let errorMessage = `${error}`;
    if ((error as Error).message.includes('content script')) {
      errorMessage = `Content script error\nTry refreshing the page or using a different website`;
    } else if ((error as Error).message.includes('Could not establish connection')) {
      errorMessage = `Extension connection error\nTry reloading the extension`;
    }

    showStatus(`❌ AI Summarizer failed\n\n${errorMessage}`, 'error', true);

    // Update AI metrics for failure
    try {
      const result = await chrome.storage.local.get(['aiMetrics']);
      const metrics = result.aiMetrics || {
        totalSummaries: 0,
        successCount: 0,
        failureCount: 0,
        avgTime: 0,
        apiType: 'chrome-ai' as const,
        lastSummaryTime: 0
      };

      metrics.totalSummaries++;
      metrics.failureCount++;
      metrics.lastSummaryTime = Date.now();

      updateAIMetrics(metrics);
      await saveAIMetrics(metrics);
    } catch (error) {
      console.error('[Rewind. Popup] Failed to update AI metrics on failure:', error);
    }
  } finally {
    setButtonLoading(testAIBtn, false);
  }
}

/**
 * Test embedding generation
 */
async function testEmbeddings(): Promise<void> {
  setButtonLoading(testEmbeddingsBtn, true);

  try {
    showStatus('Testing embedding generation...', 'info');

    const testText = 'This is a test text for embedding generation. Embeddings convert text into numerical vectors that capture semantic meaning.';

    const response = await chrome.runtime.sendMessage({
      type: 'TEST_EMBEDDINGS',
      text: testText
    });

    if (!response?.success) {
      throw new Error(response?.error || 'Embedding test failed');
    }

    const message = `✅ Embedding Generation Working!\n\n` +
      `Test Text: "${testText}"\n` +
      `Embedding Dimensions: ${response.dimensions}\n` +
      `Generation Time: ${response.generationTime}ms\n` +
      `Model: ${response.model || 'all-MiniLM-L6-v2'}\n\n` +
      `First 5 values: [${response.embedding?.slice(0, 5).join(', ')}...]`;

    showStatus(message, 'success', true);

  } catch (error) {
    console.error('[Rewind. Popup] Error testing embeddings:', error);
    showStatus(`❌ Embedding test failed\n\n${error}`, 'error', true);
  } finally {
    setButtonLoading(testEmbeddingsBtn, false);
  }
}

/**
 * Test hybrid search (semantic + keyword)
 */
async function testHybridSearch(): Promise<void> {
  setButtonLoading(testHybridSearchBtn, true);

  try {
    showStatus('Testing hybrid search...', 'info');

    const testQueries = [
      'javascript async await',
      'machine learning tensorflow',
      'react components state',
      'node.js server side'
    ];

    const response = await chrome.runtime.sendMessage({
      type: 'TEST_HYBRID_SEARCH',
      queries: testQueries
    });

    if (!response?.success) {
      throw new Error(response?.error || 'Hybrid search test failed');
    }

    let message = `✅ Hybrid Search Test Complete!\n\n`;

    response.results.forEach((result: any) => {
      message += `Query "${result.query}":\n`;
      message += `  Semantic Results: ${result.semanticCount}\n`;
      message += `  Keyword Results: ${result.keywordCount}\n`;
      message += `  Hybrid Results: ${result.hybridCount}\n`;
      message += `  Processing Time: ${result.processingTime}ms\n\n`;
    });

    showStatus(message, 'success', true);

  } catch (error) {
    console.error('[Rewind. Popup] Error testing hybrid search:', error);
    showStatus(`❌ Hybrid search test failed\n\n${error}`, 'error', true);
  } finally {
    setButtonLoading(testHybridSearchBtn, false);
  }
}

/**
 * Test search metrics with existing data
 */
async function testSearchMetrics(): Promise<void> {
  setButtonLoading(testSearchBtn, true);

  try {
    showStatus('Running search metrics test...', 'info');

    // Run comprehensive search test
    const response = await chrome.runtime.sendMessage({
      type: 'RUN_SEARCH_METRICS_TEST'
    });

    if (!response?.success) {
      throw new Error(response?.error || 'Search metrics test failed');
    }

    const metrics = response.metrics;

    // Format results for display
    const message = formatSearchMetrics(metrics);
    showStatus(message, 'success', true);

  } catch (error) {
    console.error('[Rewind. Popup] Error testing search metrics:', error);
    showStatus(`❌ Search metrics test failed\n\n${error}`, 'error', true);
  } finally {
    setButtonLoading(testSearchBtn, false);
  }
}

/**
 * Format search metrics for display
 */
function formatSearchMetrics(metrics: any): string {
  const { results, summary } = metrics;

  let output = `🔍 Search Metrics Test Results\n\n`;

  // Test summary
  output += `📊 Summary:\n`;
  output += `  Total Tests: ${summary.totalTests}\n`;
  output += `  Indexed Pages: ${summary.totalPages}\n`;
  output += `  Avg Search Time: ${summary.avgSearchTime.toFixed(2)}ms\n`;
  output += `  Fastest Mode: ${summary.fastestMode}\n`;
  output += `  Best Results: ${summary.bestResultMode}\n\n`;

  // Performance by mode
  output += `⚡ Performance by Mode:\n`;
  Object.entries(results.byMode).forEach(([mode, data]: [string, any]) => {
    output += `  ${mode.toUpperCase()}:\n`;
    output += `    Avg Time: ${data.avgTime.toFixed(2)}ms\n`;
    output += `    Avg Results: ${data.avgResults.toFixed(1)}\n`;
    output += `    Avg Similarity: ${data.avgSimilarity.toFixed(3)}\n`;
  });

  output += `\n📈 Result Quality:\n`;
  output += `  High Quality (≥0.8): ${summary.highQualityResults}\n`;
  output += `  Medium Quality (0.5-0.8): ${summary.mediumQualityResults}\n`;
  output += `  Low Quality (<0.5): ${summary.lowQualityResults}\n`;

  output += `\n📊 Similarity Analysis:\n`;
  output += `  Max Similarity: ${summary.maxSimilarity}\n`;
  output += `  Median Similarity: ${summary.medianSimilarity}\n`;
  output += `  Min Similarity: ${summary.minSimilarity}\n`;
  output += `  Avg Semantic: ${summary.avgSemanticSimilarity}\n`;
  output += `  Total Semantic Results: ${summary.totalSemanticResults}\n`;

  output += `\n✅ Threshold Test (0.5 minimum):\n`;
  output += `  All results respect threshold: ${summary.thresholdRespected ? '✅ Yes' : '❌ No'}\n`;

  // Sample queries
  output += `\n🔍 Sample Query Results:\n`;
  Object.entries(results.sampleQueries).slice(0, 3).forEach(([query, data]: [string, any]) => {
    output += `  "${query}": ${data.totalResults} results in ${data.totalTime.toFixed(2)}ms\n`;
  });

  return output;
}

/**
 * Add test data for search metrics testing
 */
async function addTestData(): Promise<void> {
  setButtonLoading(addTestDataBtn, true);

  try {
    showStatus('Adding test data...', 'info');

    // Test data for diverse search testing
    const testPages = [
      {
        url: 'https://developer.mozilla.org/en-US/docs/Web/JavaScript',
        title: 'JavaScript | MDN Web Docs',
        content: `JavaScript is a lightweight, interpreted programming language. It is designed for creating network-centric applications. JavaScript is a versatile scripting language that can be used for web development, mobile app development, game development, and desktop application development. JavaScript supports object-oriented, imperative, and functional programming paradigms. Key features include dynamic typing, prototype-based object orientation, first-class functions, and automatic memory management. JavaScript enables dynamic web page content, interactive forms, animations, and can handle asynchronous operations with callbacks, promises, and async/await syntax. Modern JavaScript (ES6+) includes features like arrow functions, destructuring, classes, modules, and enhanced array methods. The language runs in web browsers, on servers with Node.js, and can be compiled to native code for mobile applications. JavaScript's event-driven programming model makes it ideal for handling user interactions, network requests, and real-time data updates.`,
        summary: 'JavaScript is a versatile programming language for web and application development with dynamic typing and multiple programming paradigms.'
      },
      {
        url: 'https://www.tensorflow.org/guide',
        title: 'TensorFlow Guide | Machine Learning',
        content: `TensorFlow is an end-to-end open source platform for machine learning. It has a comprehensive, flexible ecosystem of tools, libraries and community resources that lets researchers push the state-of-the-art in ML and developers easily build and deploy ML powered applications. TensorFlow provides multiple APIs, including Keras for high-level modeling, and lower-level APIs for research and customization. It supports deep learning, neural networks, and traditional machine learning algorithms. TensorFlow excels at training and deploying deep neural networks across multiple CPUs and GPUs. It offers automatic differentiation, distributed computing, and production deployment tools. TensorFlow Lite enables mobile and embedded deployment, while TensorFlow.js allows running models directly in web browsers. The platform supports computer vision, natural language processing, reinforcement learning, and time series analysis. TensorFlow's computational graph model enables efficient optimization and parallel execution of complex mathematical operations.`,
        summary: 'TensorFlow is a comprehensive machine learning platform that provides tools and libraries for building and deploying ML applications with support for deep learning.'
      },
      {
        url: 'https://reactjs.org/tutorial/tutorial.html',
        title: 'React Tutorial - Learn Web Development',
        content: `React is a JavaScript library for building user interfaces. It makes it painless to create interactive UIs. Design simple views for each state in your application, and React will efficiently update and render just the right components when your data changes. Build encapsulated components that manage their own state, then compose them to make complex UIs. Since component logic is written in JavaScript instead of templates, you can easily pass rich data through your app and keep state out of the DOM. React uses a virtual DOM for efficient rendering and implements a unidirectional data flow. Components can be functional with hooks like useState, useEffect, and useContext, or class-based with lifecycle methods. React Router enables navigation, while Redux and Context API manage global state. The ecosystem includes numerous libraries for forms, animations, styling, and data fetching. React's component-based architecture promotes reusability and maintainability in large applications.`,
        summary: 'React is a JavaScript library for building interactive user interfaces with component-based architecture and efficient state management.'
      },
      {
        url: 'https://nodejs.org/en/docs/guides/',
        title: 'Node.js Documentation | Server-side JavaScript',
        content: `Node.js is a JavaScript runtime built on Chrome's V8 JavaScript engine. Node.js uses an event-driven, non-blocking I/O model that makes it lightweight and efficient. Node.js' package ecosystem, npm, is the largest ecosystem of open source libraries in the world. Node.js enables JavaScript to be used for server-side scripting, command-line tools, and desktop applications. It provides APIs for file system access, networking, and operating system integration.`,
        summary: 'Node.js is a server-side JavaScript runtime that enables building scalable network applications with its event-driven, non-blocking I/O architecture.'
      },
      {
        url: 'https://developers.google.com/web/tools/chrome-devtools',
        title: 'Chrome DevTools Documentation | Web Development',
        content: `Chrome DevTools is a set of web developer tools built directly into the Google Chrome browser. DevTools can help you edit pages on-the-fly and diagnose problems quickly, which ultimately helps you build better websites, faster. DevTools provides comprehensive tools for debugging JavaScript, analyzing network performance, optimizing page rendering, and auditing accessibility. The Elements panel allows DOM inspection and manipulation, while the Console provides a JavaScript REPL and debugging interface.`,
        summary: 'Chrome DevTools is a comprehensive set of web development tools built into Chrome browser for debugging, performance analysis, and page optimization.'
      }
    ];

    let addedCount = 0;
    for (const page of testPages) {
      try {
        const response = await chrome.runtime.sendMessage({
          type: 'ADD_TEST_PAGE',
          ...page
        });

        if (response?.success) {
          addedCount++;
          console.log(`[Rewind. Popup] Added test page: ${page.title}`);
        }
      } catch (error) {
        console.error(`[Rewind. Popup] Failed to add test page: ${page.title}`, error);
      }
    }

    showStatus(`✅ Added ${addedCount} test pages for search testing!`, 'success', true);

  } catch (error) {
    console.error('[Rewind. Popup] Error adding test data:', error);
    showStatus(`❌ Failed to add test data\n\n${error}`, 'error', true);
  } finally {
    setButtonLoading(addTestDataBtn, false);
  }
}

/**
 * Clear all data
 */
async function clearAllData(): Promise<void> {
  if (!confirm('Are you sure you want to clear all data? This cannot be undone.')) {
    return;
  }

  setButtonLoading(clearDataBtn, true);

  try {
    showStatus('Clearing all data...', 'info');

    const response = await chrome.runtime.sendMessage({ type: 'CLEAR_HISTORY' });

    if (!response?.success) {
      throw new Error(response?.error || 'Failed to clear data');
    }

    showStatus('✅ All data cleared successfully!', 'success', true);

  } catch (error) {
    console.error('[Rewind. Popup] Error clearing data:', error);
    showStatus(`❌ Failed to clear data\n\n${error}`, 'error', true);
  } finally {
    setButtonLoading(clearDataBtn, false);
  }
}

/**
 * Initialize popup
 */
function initialize(): void {
  // Add event listeners
  toggleSidebarBtn?.addEventListener('click', toggleSidebar);
  showStatsBtn?.addEventListener('click', showStats);
  testAIBtn?.addEventListener('click', testAI);
  testEmbeddingsBtn?.addEventListener('click', testEmbeddings);
  testSearchBtn?.addEventListener('click', testSearchMetrics);
  testHybridSearchBtn?.addEventListener('click', testHybridSearch);
  addTestDataBtn?.addEventListener('click', addTestData);
  clearDataBtn?.addEventListener('click', clearAllData);

  // Check Chrome AI availability
  checkChromeAIAvailability();

  // Check pipeline status
  checkPipelineStatus();

  // Load AI metrics
  loadAIMetrics();

  // Set up periodic pipeline status updates
  setInterval(checkPipelineStatus, 3000); // Update every 3 seconds

  // Check initial state
  canUseContentScript().then(canUse => {
    testAIBtn.disabled = !canUse;
    testEmbeddingsBtn.disabled = !canUse;
    if (!canUse) {
      showStatus('Some features disabled\nNavigate to a regular website', 'info');
    }
  });

  console.log('[Rewind. Popup] Enhanced popup initialized with testing controls and monitoring');
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initialize);
} else {
  initialize();
}
