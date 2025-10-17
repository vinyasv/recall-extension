/**
 * Chat UI - Handles Search and Ask (RAG) functionality
 */

console.log('[Chat] Initializing chat interface...');

// DOM Elements
const tabs = document.querySelectorAll('.tab');
const tabContents = document.querySelectorAll('.tab-content');

// Search tab elements
const searchInput = document.getElementById('search-input') as HTMLInputElement;
const searchButton = document.getElementById('search-button') as HTMLButtonElement;
const searchResults = document.getElementById('search-results') as HTMLDivElement;
const searchError = document.getElementById('search-error') as HTMLDivElement;

// Ask tab elements
const messagesContainer = document.getElementById('messages-container') as HTMLDivElement;
const askInput = document.getElementById('ask-input') as HTMLTextAreaElement;
const askButton = document.getElementById('ask-button') as HTMLButtonElement;
const askLoading = document.getElementById('ask-loading') as HTMLDivElement;
const askError = document.getElementById('ask-error') as HTMLDivElement;

// State
let currentTab = 'search';
let isSearching = false;
let isAsking = false;
let conversationHistory: Array<{ role: 'user' | 'assistant'; content: string; sources?: any[] }> = [];

/**
 * Tab Management
 */
tabs.forEach((tab) => {
  tab.addEventListener('click', () => {
    const tabName = tab.getAttribute('data-tab');
    if (!tabName) return;

    // Update active states
    tabs.forEach((t) => t.classList.remove('active'));
    tab.classList.add('active');

    tabContents.forEach((content) => {
      content.classList.remove('active');
    });

    const targetContent = document.getElementById(`${tabName}-tab`);
    if (targetContent) {
      targetContent.classList.add('active');
      currentTab = tabName;
    }
  });
});

/**
 * Search Functionality
 */
searchButton.addEventListener('click', async () => {
  await performSearch();
});

searchInput.addEventListener('keydown', async (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    await performSearch();
  }
});

async function performSearch() {
  const query = searchInput.value.trim();

  if (!query) {
    showError(searchError, 'Please enter a search query');
    return;
  }

  if (isSearching) {
    return;
  }

  isSearching = true;
  searchButton.disabled = true;
  searchButton.textContent = 'Searching...';
  hideError(searchError);

  try {
    const response = await chrome.runtime.sendMessage({
      type: 'SEARCH_QUERY',
      query,
      options: {
        mode: 'hybrid',
        k: 20,
      },
    });

    if (response.success) {
      displaySearchResults(response.results);
    } else {
      showError(searchError, response.error || 'Search failed');
    }
  } catch (error) {
    console.error('[Chat] Search error:', error);
    showError(searchError, 'Failed to perform search');
  } finally {
    isSearching = false;
    searchButton.disabled = false;
    searchButton.textContent = 'Search';
  }
}

function displaySearchResults(results: any[]) {
  searchResults.innerHTML = '';

  if (results.length === 0) {
    searchResults.innerHTML = '<div class="no-results">No results found</div>';
    return;
  }

  results.forEach((page) => {
    const resultDiv = document.createElement('div');
    resultDiv.className = 'search-result';

    const title = document.createElement('div');
    title.className = 'result-title';
    title.textContent = page.title || 'Untitled';

    const url = document.createElement('div');
    url.className = 'result-url';
    url.textContent = page.url;

    const summary = document.createElement('div');
    summary.className = 'result-summary';
    summary.textContent = page.summary || page.content?.substring(0, 200) + '...';

    resultDiv.appendChild(title);
    resultDiv.appendChild(url);
    resultDiv.appendChild(summary);

    resultDiv.addEventListener('click', () => {
      chrome.tabs.create({ url: page.url });
    });

    searchResults.appendChild(resultDiv);
  });
}

/**
 * Ask (RAG) Functionality
 */
askButton.addEventListener('click', async () => {
  await askQuestion();
});

askInput.addEventListener('keydown', async (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    await askQuestion();
  }
});

// Auto-resize textarea
askInput.addEventListener('input', () => {
  askInput.style.height = 'auto';
  askInput.style.height = askInput.scrollHeight + 'px';
});

async function askQuestion() {
  const question = askInput.value.trim();

  if (!question) {
    showError(askError, 'Please enter a question');
    return;
  }

  if (isAsking) {
    return;
  }

  isAsking = true;
  askButton.disabled = true;
  askInput.disabled = true;
  hideError(askError);

  // Clear empty state if this is the first message
  const emptyState = messagesContainer.querySelector('.empty-state');
  if (emptyState) {
    emptyState.remove();
  }

  // Add user message
  addMessage('user', question);
  askInput.value = '';
  askInput.style.height = 'auto';

  // Show loading
  askLoading.classList.add('active');
  scrollToBottom();

  try {
    // Check if RAG is available
    const availabilityResponse = await chrome.runtime.sendMessage({
      type: 'CHECK_RAG_AVAILABILITY',
    });

    if (!availabilityResponse.available) {
      throw new Error(
        'RAG functionality is not available. Make sure Chrome Prompt API is enabled (Chrome 138+ with Gemini Nano)'
      );
    }

    // Send RAG query
    const response = await chrome.runtime.sendMessage({
      type: 'RAG_QUERY',
      question,
      options: {
        topK: 5,
        minSimilarity: 0.3,
      },
    });

    if (response.success) {
      // Add assistant message with answer
      addMessage('assistant', response.answer, response.sources, response.timings);

      // Store in conversation history
      conversationHistory.push(
        { role: 'user', content: question },
        { role: 'assistant', content: response.answer, sources: response.sources }
      );
    } else {
      throw new Error(response.error || 'Failed to get answer');
    }
  } catch (error) {
    console.error('[Chat] Ask error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to answer question';
    showError(askError, errorMessage);

    // Add error message as assistant response
    addMessage(
      'assistant',
      `Sorry, I encountered an error: ${errorMessage}`,
      undefined,
      undefined
    );
  } finally {
    isAsking = false;
    askButton.disabled = false;
    askInput.disabled = false;
    askLoading.classList.remove('active');
    askInput.focus();
  }
}

function addMessage(
  role: 'user' | 'assistant',
  content: string,
  sources?: any[],
  _timings?: { total: number; search: number; generation: number }
) {
  const messageDiv = document.createElement('div');
  messageDiv.className = `message message-${role}`;

  const bubble = document.createElement('div');
  bubble.className = 'message-bubble';
  bubble.textContent = content;

  messageDiv.appendChild(bubble);

  // Add sources if available (only for assistant messages)
  if (role === 'assistant' && sources && sources.length > 0) {
    const sourcesDiv = document.createElement('div');
    sourcesDiv.className = 'message-sources';

    const sourcesTitle = document.createElement('div');
    sourcesTitle.className = 'sources-title';
    sourcesTitle.textContent = `Sources (${sources.length})`;

    sourcesDiv.appendChild(sourcesTitle);

    sources.forEach((source) => {
      const sourceLink = document.createElement('a');
      sourceLink.className = 'source-item';
      sourceLink.textContent = `• ${source.page.title}`;
      sourceLink.href = source.page.url;
      sourceLink.target = '_blank';
      sourceLink.addEventListener('click', (e) => {
        e.preventDefault();
        chrome.tabs.create({ url: source.page.url });
      });

      sourcesDiv.appendChild(sourceLink);
    });

    messageDiv.appendChild(sourcesDiv);
  }

  messagesContainer.appendChild(messageDiv);
  scrollToBottom();
}

function scrollToBottom() {
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

/**
 * Error Handling
 */
function showError(element: HTMLElement, message: string) {
  element.textContent = message;
  element.classList.add('active');

  // Auto-hide after 5 seconds
  setTimeout(() => {
    hideError(element);
  }, 5000);
}

function hideError(element: HTMLElement) {
  element.classList.remove('active');
}

/**
 * Initialize
 */
async function initializeChat() {
  console.log('[Chat] Chat interface ready');

  // Check RAG availability on load
  try {
    const response = await chrome.runtime.sendMessage({
      type: 'CHECK_RAG_AVAILABILITY',
    });

    if (!response.available) {
      console.warn('[Chat] RAG functionality not available');
      showError(
        askError,
        'AI features require Chrome 138+ with Gemini Nano. You can still use Search.'
      );
    }
  } catch (error) {
    console.error('[Chat] Failed to check RAG availability:', error);
  }

  // Focus search input by default
  searchInput.focus();
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeChat);
} else {
  initializeChat();
}
