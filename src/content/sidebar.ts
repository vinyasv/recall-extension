/**
 * Rewind Sidebar Overlay
 * Injects a beautiful sidebar into webpages for semantic search
 */

console.log('[Rewind Sidebar] Initializing sidebar module...');

let sidebarOpen = false;
let sidebarContainer: HTMLElement | null = null;

/**
 * Create and inject the sidebar overlay
 */
export function createSidebar(): void {
  console.log('[Rewind Sidebar] createSidebar() called');
  
  if (sidebarContainer) {
    console.log('[Rewind Sidebar] Sidebar already exists, skipping creation');
    return; // Already exists
  }
  
  console.log('[Rewind Sidebar] Creating sidebar DOM elements...');

  // Create sidebar container
  sidebarContainer = document.createElement('div');
  sidebarContainer.id = 'rewind-sidebar-overlay';
  sidebarContainer.className = 'rewind-sidebar-hidden';
  
  sidebarContainer.innerHTML = `
    <div class="rewind-sidebar-backdrop"></div>
    <div class="rewind-sidebar">
      <div class="rewind-sidebar-content">
        <!-- Header -->
        <div class="rewind-header">
          <div class="rewind-logo">Rewind.</div>
          <button class="rewind-close-btn" id="rewindCloseBtn">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M1 1L13 13M13 1L1 13" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
            </svg>
          </button>
        </div>

        <!-- Divider -->
        <div class="rewind-divider"></div>

        <!-- Search Box -->
        <div class="rewind-search-container">
          <div class="rewind-search-box">
            <svg class="rewind-search-icon" width="15" height="15" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg">
              <circle cx="6.5" cy="6.5" r="5" stroke="currentColor" stroke-width="1.5"/>
              <path d="M10 10L13.5 13.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
            </svg>
            <input
              type="text"
              class="rewind-search-input"
              id="rewindSearchInput"
              placeholder="search history"
              autocomplete="off"
              spellcheck="false"
            />
          </div>
        </div>

        <!-- Clear History Button -->
        <button id="rewindClearHistoryBtn" class="rewind-clear-btn">Clear History</button>

        <!-- Results Container -->
        <div id="rewindResultsContainer" class="rewind-results"></div>
      </div>
    </div>
  `;

  // Inject styles
  injectStyles();

  // Append to body
  console.log('[Rewind Sidebar] Appending sidebar to document.body...');
  
  if (!document.body) {
    console.error('[Rewind Sidebar] document.body not available yet!');
    return;
  }
  
  try {
    document.body.appendChild(sidebarContainer);
    console.log('[Rewind Sidebar] Sidebar successfully appended to DOM');
  } catch (error) {
    console.error('[Rewind Sidebar] Error appending sidebar:', error);
    sidebarContainer = null;
    return;
  }

  // Set up event listeners
  setupEventListeners();
  console.log('[Rewind Sidebar] Event listeners set up, sidebar ready!');
}

/**
 * Inject sidebar styles
 */
function injectStyles(): void {
  if (document.getElementById('rewind-sidebar-styles')) {
    console.log('[Rewind Sidebar] Styles already injected, skipping');
    return;
  }

  console.log('[Rewind Sidebar] Injecting sidebar styles...');

  try {
    const style = document.createElement('style');
    style.id = 'rewind-sidebar-styles';
    style.textContent = `
    /* Sidebar Overlay */
    #rewind-sidebar-overlay {
      position: fixed;
      top: 0;
      right: 0;
      bottom: 0;
      left: 0;
      z-index: 2147483647;
      pointer-events: none;
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif;
    }

    #rewind-sidebar-overlay * {
      box-sizing: border-box;
    }

    .rewind-sidebar-hidden {
      opacity: 0;
      visibility: hidden;
    }

    /* Backdrop */
    .rewind-sidebar-backdrop {
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.2);
      opacity: 0;
      transition: opacity 0.3s ease;
      pointer-events: none;
    }

    #rewind-sidebar-overlay:not(.rewind-sidebar-hidden) .rewind-sidebar-backdrop {
      opacity: 1;
      pointer-events: all;
    }

    /* Sidebar */
    .rewind-sidebar {
      position: fixed;
      top: 20px;
      right: 20px;
      bottom: 20px;
      width: 400px;
      background: #FFFFFF;
      border-radius: 16px;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.15), 0 0 1px rgba(0, 0, 0, 0.1);
      transform: translateX(calc(100% + 40px));
      transition: transform 0.4s cubic-bezier(0.16, 1, 0.3, 1);
      pointer-events: all;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }

    #rewind-sidebar-overlay:not(.rewind-sidebar-hidden) .rewind-sidebar {
      transform: translateX(0);
    }

    .rewind-sidebar-content {
      display: flex;
      flex-direction: column;
      gap: 12px;
      padding: 24px 20px;
      height: 100%;
      overflow-y: auto;
      overflow-x: hidden;
    }

    .rewind-sidebar-content::-webkit-scrollbar {
      width: 6px;
    }

    .rewind-sidebar-content::-webkit-scrollbar-track {
      background: transparent;
    }

    .rewind-sidebar-content::-webkit-scrollbar-thumb {
      background: rgba(0, 0, 0, 0.1);
      border-radius: 3px;
    }

    .rewind-sidebar-content::-webkit-scrollbar-thumb:hover {
      background: rgba(0, 0, 0, 0.2);
    }

    /* Header */
    .rewind-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 12px;
      flex-shrink: 0;
    }

    .rewind-logo {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
      font-weight: 500;
      font-size: 20px;
      line-height: 1;
      color: #000000;
      letter-spacing: -0.02em;
    }

    .rewind-close-btn {
      width: 32px;
      height: 32px;
      border: none;
      background: rgba(0, 0, 0, 0.05);
      border-radius: 8px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      color: rgba(0, 0, 0, 0.6);
      transition: all 0.2s ease;
      flex-shrink: 0;
    }

    .rewind-close-btn:hover {
      background: rgba(0, 0, 0, 0.1);
      color: rgba(0, 0, 0, 0.8);
    }

    .rewind-close-btn:active {
      transform: scale(0.95);
    }

    /* Divider */
    .rewind-divider {
      width: 100%;
      height: 1px;
      background: #E5E5E5;
      flex-shrink: 0;
    }

    /* Search */
    .rewind-search-container {
      flex-shrink: 0;
    }

    .rewind-search-box {
      position: relative;
      height: 40px;
      border: 1px solid #E5E5E5;
      border-radius: 10px;
      background: #FFFFFF;
      transition: all 0.3s ease;
    }

    .rewind-search-box:focus-within {
      border-color: rgba(0, 0, 0, 0.2);
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
    }

    .rewind-search-icon {
      position: absolute;
      left: 12px;
      top: 50%;
      transform: translateY(-50%);
      color: rgba(0, 0, 0, 0.4);
      transition: color 0.3s ease;
      pointer-events: none;
    }

    .rewind-search-box:focus-within .rewind-search-icon {
      color: rgba(0, 0, 0, 0.6);
    }

    .rewind-search-input {
      position: absolute;
      left: 40px;
      top: 0;
      right: 12px;
      height: 100%;
      border: none;
      background: transparent;
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
      font-weight: 400;
      font-size: 12px;
      color: #000000;
      outline: none;
    }

    .rewind-search-input::placeholder {
      color: rgba(0, 0, 0, 0.4);
    }

    /* Clear Button */
    .rewind-clear-btn {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
      font-weight: 400;
      font-size: 11px;
      color: rgba(0, 0, 0, 0.5);
      background: none;
      border: none;
      padding: 0;
      cursor: pointer;
      text-decoration: underline;
      transition: all 0.3s ease;
      text-align: left;
      flex-shrink: 0;
    }

    .rewind-clear-btn:hover {
      color: rgba(0, 0, 0, 0.8);
    }

    /* Results */
    .rewind-results {
      display: flex;
      flex-direction: column;
      gap: 16px;
      flex: 1;
      min-height: 0;
    }

    .rewind-date-header {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
      font-weight: 500;
      font-size: 12px;
      color: #000000;
      margin-bottom: 8px;
    }

    .rewind-results-group {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .rewind-result-item {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 8px;
      border-radius: 8px;
      cursor: pointer;
      transition: all 0.2s ease;
    }

    .rewind-result-item:hover {
      background: rgba(0, 0, 0, 0.03);
    }

    .rewind-result-item:active {
      background: rgba(0, 0, 0, 0.05);
    }

    .rewind-result-time {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
      font-weight: 400;
      font-size: 11px;
      color: rgba(0, 0, 0, 0.5);
      width: 50px;
      flex-shrink: 0;
    }

    .rewind-result-favicon {
      width: 20px;
      height: 20px;
      border-radius: 4px;
      object-fit: cover;
      flex-shrink: 0;
    }

    .rewind-result-content {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .rewind-result-title {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
      font-weight: 500;
      font-size: 12px;
      color: #000000;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .rewind-result-url {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
      font-weight: 400;
      font-size: 11px;
      color: rgba(0, 0, 0, 0.4);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    /* Empty State */
    .rewind-empty-state {
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      text-align: center;
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
      font-weight: 400;
      font-size: 12px;
      color: rgba(0, 0, 0, 0.5);
      padding: 40px 20px;
    }

    /* Loading */
    .rewind-loading {
      display: flex;
      flex-direction: column;
      gap: 12px;
      padding: 20px 0;
    }

    .rewind-skeleton-item {
      display: flex;
      gap: 12px;
      opacity: 0.3;
      animation: rewindPulse 1.5s ease-in-out infinite;
    }

    .rewind-skeleton-item:nth-child(2) { animation-delay: 0.1s; }
    .rewind-skeleton-item:nth-child(3) { animation-delay: 0.2s; }

    .rewind-skeleton-time {
      width: 50px;
      height: 12px;
      background: #E5E5E5;
      border-radius: 4px;
    }

    .rewind-skeleton-icon {
      width: 20px;
      height: 20px;
      background: #E5E5E5;
      border-radius: 4px;
    }

    .rewind-skeleton-text {
      flex: 1;
      height: 12px;
      background: #E5E5E5;
      border-radius: 4px;
    }

    @keyframes rewindPulse {
      0%, 100% { opacity: 0.3; }
      50% { opacity: 0.5; }
    }
  `;

    document.head.appendChild(style);
    console.log('[Rewind Sidebar] Styles successfully injected');
  } catch (error) {
    console.error('[Rewind Sidebar] Error injecting styles:', error);
  }
}

/**
 * Set up event listeners
 */
function setupEventListeners(): void {
  if (!sidebarContainer) return;

  // Close button
  const closeBtn = sidebarContainer.querySelector('#rewindCloseBtn');
  closeBtn?.addEventListener('click', closeSidebar);

  // Backdrop click
  const backdrop = sidebarContainer.querySelector('.rewind-sidebar-backdrop');
  backdrop?.addEventListener('click', closeSidebar);

  // Search input
  const searchInput = sidebarContainer.querySelector('#rewindSearchInput') as HTMLInputElement;
  let searchTimeout: ReturnType<typeof setTimeout> | null = null;
  
  searchInput?.addEventListener('input', (e) => {
    const query = (e.target as HTMLInputElement).value.trim();
    
    if (searchTimeout) {
      clearTimeout(searchTimeout);
    }
    
    if (!query) {
      loadAllHistory();
      return;
    }
    
    searchTimeout = setTimeout(() => {
      performSearch(query);
    }, 300);
  });

  // Clear history button
  const clearBtn = sidebarContainer.querySelector('#rewindClearHistoryBtn');
  clearBtn?.addEventListener('click', clearHistory);
}

/**
 * Open the sidebar
 */
export function openSidebar(): void {
  if (!sidebarContainer) {
    createSidebar();
  }
  
  sidebarContainer?.classList.remove('rewind-sidebar-hidden');
  sidebarOpen = true;
  
  // Load initial data
  loadAllHistory();
}

/**
 * Close the sidebar
 */
export function closeSidebar(): void {
  sidebarContainer?.classList.add('rewind-sidebar-hidden');
  sidebarOpen = false;
}

/**
 * Handle PAGE_INDEXED message for real-time updates
 */
let refreshTimeout: ReturnType<typeof setTimeout> | null = null;
function handlePageIndexed(pageInfo: { id: string; url: string; title: string; timestamp: number; isUpdate: boolean }): void {
  console.log('[Rewind Sidebar] Page indexed:', pageInfo.title, pageInfo.isUpdate ? '(updated)' : '(new)');

  // Only refresh if sidebar is open
  if (!sidebarOpen) {
    console.log('[Rewind Sidebar] Sidebar not open, skipping refresh');
    return;
  }

  // Check if user is actively searching
  const searchInput = sidebarContainer?.querySelector('#rewindSearchInput') as HTMLInputElement;
  if (searchInput && searchInput.value.trim()) {
    console.log('[Rewind Sidebar] Active search in progress, skipping refresh to preserve results');
    return;
  }

  // Debounce rapid updates (if multiple pages indexed quickly)
  if (refreshTimeout) {
    clearTimeout(refreshTimeout);
  }

  refreshTimeout = setTimeout(() => {
    console.log('[Rewind Sidebar] Refreshing sidebar with latest data...');
    loadAllHistory();
  }, 1000); // Wait 1 second after last update
}

/**
 * Toggle sidebar
 */
export function toggleSidebar(): void {
  if (sidebarOpen) {
    closeSidebar();
  } else {
    openSidebar();
  }
}

/**
 * Load all history
 */
async function loadAllHistory(): Promise<void> {
  const resultsContainer = sidebarContainer?.querySelector('#rewindResultsContainer');
  if (!resultsContainer) return;

  resultsContainer.innerHTML = '<div class="rewind-loading"><div class="rewind-skeleton-item"><div class="rewind-skeleton-time"></div><div class="rewind-skeleton-icon"></div><div class="rewind-skeleton-text"></div></div></div>';

  try {
    if (typeof chrome === 'undefined' || !chrome.runtime) {
      throw new Error('Chrome runtime not available');
    }
    
    const response = await chrome.runtime.sendMessage({ type: 'GET_ALL_PAGES' });
    
    if (response && response.success && response.pages) {
      renderResults(response.pages);
    } else {
      showEmptyState();
    }
  } catch (error) {
    console.error('[Rewind Sidebar] Error loading history:', error);
    showEmptyState();
  }
}

/**
 * Perform search
 */
async function performSearch(query: string): Promise<void> {
  const resultsContainer = sidebarContainer?.querySelector('#rewindResultsContainer');
  if (!resultsContainer) return;

  resultsContainer.innerHTML = '<div class="rewind-loading"><div class="rewind-skeleton-item"><div class="rewind-skeleton-time"></div><div class="rewind-skeleton-icon"></div><div class="rewind-skeleton-text"></div></div></div>';

  try {
    if (typeof chrome === 'undefined' || !chrome.runtime) {
      throw new Error('Chrome runtime not available');
    }
    
    const response = await chrome.runtime.sendMessage({ 
      type: 'SEARCH_QUERY',
      query: query
    });
    
    if (response && response.success && response.results) {
      renderResults(response.results);
    } else {
      showEmptyState();
    }
  } catch (error) {
    console.error('[Rewind Sidebar] Error searching:', error);
    showEmptyState();
  }
}

/**
 * Render results
 */
function renderResults(pages: any[]): void {
  const resultsContainer = sidebarContainer?.querySelector('#rewindResultsContainer');
  if (!resultsContainer) return;

  if (!pages || pages.length === 0) {
    showEmptyState();
    return;
  }

  // Group by date
  const grouped = groupByDate(pages);
  
  let html = '';
  for (const [date, items] of Object.entries(grouped)) {
    html += `<div class="rewind-results-group">`;
    html += `<div class="rewind-date-header">${date}</div>`;
    
    for (const page of items) {
      const time = formatTime(page.timestamp);
      const domain = getDomain(page.url);
      const favicon = getFaviconUrl(page.url);
      const title = page.title || domain;
      
      html += `
        <div class="rewind-result-item" data-url="${escapeHtml(page.url)}">
          <div class="rewind-result-time">${time}</div>
          <img class="rewind-result-favicon" src="${favicon}" onerror="this.style.display='none'" />
          <div class="rewind-result-content">
            <div class="rewind-result-title">${escapeHtml(title)}</div>
            <div class="rewind-result-url">${escapeHtml(domain)}</div>
          </div>
        </div>
      `;
    }
    
    html += `</div>`;
  }
  
  resultsContainer.innerHTML = html;
  
  // Add click handlers
  resultsContainer.querySelectorAll('.rewind-result-item').forEach(item => {
    item.addEventListener('click', () => {
      const url = item.getAttribute('data-url');
      if (url) {
        window.open(url, '_blank');
      }
    });
  });
}

/**
 * Show empty state
 */
function showEmptyState(): void {
  const resultsContainer = sidebarContainer?.querySelector('#rewindResultsContainer');
  if (!resultsContainer) return;
  
  resultsContainer.innerHTML = `
    <div class="rewind-empty-state">
      Start browsing & rewind will build your history.
    </div>
  `;
}

/**
 * Clear history
 */
async function clearHistory(): Promise<void> {
  if (!confirm('Are you sure you want to clear all your browsing history? This cannot be undone.')) {
    return;
  }

  try {
    if (typeof chrome === 'undefined' || !chrome.runtime) {
      throw new Error('Chrome runtime not available');
    }
    
    const response = await chrome.runtime.sendMessage({ type: 'CLEAR_HISTORY' });
    
    if (response && response.success) {
      showEmptyState();
    }
  } catch (error) {
    console.error('[Rewind Sidebar] Error clearing history:', error);
  }
}

// Helper functions
function groupByDate(pages: any[]): Record<string, any[]> {
  const grouped: Record<string, any[]> = {};
  
  pages.forEach(page => {
    const date = formatDate(page.timestamp);
    if (!grouped[date]) {
      grouped[date] = [];
    }
    grouped[date].push(page);
  });
  
  return grouped;
}

function formatDate(timestamp: number): string {
  const date = new Date(timestamp);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  
  if (date.toDateString() === today.toDateString()) {
    return `Today, ${date.toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}`;
  } else if (date.toDateString() === yesterday.toDateString()) {
    return `Yesterday, ${date.toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}`;
  } else {
    return date.toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  }
}

function formatTime(timestamp: number): string {
  const date = new Date(timestamp);
  let hours = date.getHours();
  const minutes = date.getMinutes();
  const ampm = hours >= 12 ? 'PM' : 'AM';
  
  hours = hours % 12;
  hours = hours ? hours : 12;
  
  const minutesStr = minutes < 10 ? '0' + minutes : minutes;
  
  return `${hours}:${minutesStr} ${ampm}`;
}

function getDomain(url: string): string {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname;
  } catch {
    return url;
  }
}

function getFaviconUrl(url: string): string {
  try {
    const urlObj = new URL(url);
    return `https://www.google.com/s2/favicons?domain=${urlObj.hostname}&sz=32`;
  } catch {
    return '';
  }
}

function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Listen for keyboard shortcut
document.addEventListener('keydown', (e) => {
  // Cmd/Ctrl + Shift + E to toggle sidebar
  if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'e') {
    e.preventDefault();
    console.log('[Rewind Sidebar] Keyboard shortcut triggered:', e.key);
    toggleSidebar();
  }
});

// Listen for messages from extension
if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.type === 'TOGGLE_SIDEBAR') {
      toggleSidebar();
      sendResponse({ success: true });
    } else if (message.type === 'PAGE_INDEXED') {
      // Real-time update when a new page is indexed
      handlePageIndexed(message.data);
      sendResponse({ success: true });
    }
    return true;
  });
}

// Log that sidebar is ready
console.log('[Rewind Sidebar] Sidebar script loaded and ready');

