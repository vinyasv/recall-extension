/**
 * Rewind Sidebar Overlay
 * Injects a beautiful sidebar into webpages for semantic search
 */

import { loggers } from '../lib/utils/logger';

loggers.sidebar.debug('Initializing sidebar module...');

let sidebarOpen = false;
let activeSearchQuery: string | null = null;
let sidebarContainer: HTMLElement | null = null;
let refreshTimeout: ReturnType<typeof setTimeout> | null = null;

/**
 * Create and inject the sidebar overlay
 */
export function createSidebar(): void {
  loggers.sidebar.debug('createSidebar() called');
  
  if (sidebarContainer) {
    loggers.sidebar.debug('Sidebar already exists, skipping creation');
    return; // Already exists
  }
  
  loggers.sidebar.debug('Creating sidebar DOM elements...');

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

        <!-- Tabs -->
        <div class="rewind-tabs">
          <button class="rewind-tab rewind-tab-active" data-tab="ask" id="rewindAskTab">Ask</button>
          <button class="rewind-tab" data-tab="search" id="rewindSearchTab">Search</button>
        </div>

        <!-- Divider -->
        <div class="rewind-divider"></div>

        <!-- Ask Tab Content -->
        <div class="rewind-tab-content rewind-tab-content-active" id="rewindAskContent">
          <div class="rewind-chat-messages" id="rewindChatMessages">
            <div class="rewind-chat-empty">
              <div class="rewind-chat-empty-title">Your personal AI, with 100% privacy.</div>
              <div class="rewind-chat-empty-subtitle">Rewind indexes your history on-device. Ask a question to get answers, not just links.</div>
              <div class="rewind-chat-empty-input-container">
                <input
                  type="text"
                  class="rewind-chat-empty-input"
                  id="rewindChatEmptyInput"
                  placeholder="Ask a question about your history"
                  autocomplete="off"
                  spellcheck="false"
                />
                <button class="rewind-chat-empty-send-btn" id="rewindChatEmptySendBtn">
                  <img src="" id="rewindSendIcon" alt="Send" />
                </button>
              </div>
            </div>
          </div>
          <div class="rewind-chat-input-container" style="display: none;">
            <input
              type="text"
              class="rewind-chat-input"
              id="rewindChatInput"
              placeholder="Ask a question about your history"
              autocomplete="off"
              spellcheck="false"
            />
            <button class="rewind-chat-send-btn" id="rewindChatSendBtn">
              <img src="" class="rewind-send-icon-img" alt="Send" />
            </button>
          </div>
        </div>

        <!-- Search Tab Content -->
        <div class="rewind-tab-content" id="rewindSearchContent">
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
    </div>
  `;

  // Inject styles
  injectStyles();

  // Append to body
  loggers.sidebar.debug('Appending sidebar to document.body...');
  
  if (!document.body) {
    loggers.sidebar.error('document.body not available yet!');
    return;
  }
  
  try {
    document.body.appendChild(sidebarContainer);
    loggers.sidebar.debug('Sidebar successfully appended to DOM');
  } catch (error) {
    loggers.sidebar.error('Error appending sidebar:', error);
    sidebarContainer = null;
    return;
  }

  // Set up event listeners
  setupEventListeners();

  // Set send icon URLs
  const sendIconUrl = chrome.runtime.getURL('send.svg');
  const sendIcon = sidebarContainer.querySelector('#rewindSendIcon') as HTMLImageElement;
  if (sendIcon) sendIcon.src = sendIconUrl;

  const sendIcons = sidebarContainer.querySelectorAll('.rewind-send-icon-img') as NodeListOf<HTMLImageElement>;
  sendIcons.forEach(icon => icon.src = sendIconUrl);

  loggers.sidebar.debug('Event listeners set up, sidebar ready!');
}

/**
 * Inject sidebar styles
 */
function injectStyles(): void {
  if (document.getElementById('rewind-sidebar-styles')) {
    loggers.sidebar.debug('Styles already injected, skipping');
    return;
  }

  loggers.sidebar.debug('Injecting sidebar styles...');

  try {
    const backgroundUrl = chrome.runtime.getURL('Background@2x.png');
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
      background: #FFFFFF url('${backgroundUrl}') center/cover no-repeat;
      border-radius: 5px;
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

    /* Tabs */
    .rewind-tabs {
      display: flex;
      gap: 20px;
      padding: 0 4px;
      flex-shrink: 0;
    }

    .rewind-tab {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
      font-weight: 400;
      font-size: 14px;
      color: rgba(0, 0, 0, 0.4);
      background: none;
      border: none;
      padding: 0;
      cursor: pointer;
      transition: color 0.2s ease;
      position: relative;
    }

    .rewind-tab:hover {
      color: rgba(0, 0, 0, 0.6);
    }

    .rewind-tab-active {
      color: #000000;
      font-weight: 500;
    }

    .rewind-tab-active::after {
      content: '';
      position: absolute;
      bottom: -8px;
      left: 0;
      right: 0;
      height: 2px;
      background: #000000;
    }

    /* Divider */
    .rewind-divider {
      width: 100%;
      height: 1px;
      background: #E5E5E5;
      flex-shrink: 0;
    }

    /* Tab Content */
    .rewind-tab-content {
      display: none;
      flex-direction: column;
      gap: 12px;
      flex: 1;
      min-height: 0;
    }

    .rewind-tab-content-active {
      display: flex;
    }

    /* Search */
    .rewind-search-container {
      flex-shrink: 0;
    }

    .rewind-search-box {
      position: relative;
      height: 40px;
      border: 1px solid #E5E5E5;
      border-radius: 3px;
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
      font-weight: 300;
      font-size: 10px;
      color: rgba(0, 0, 0, 0.38);
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
      color: rgba(0, 0, 0, 0.6);
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
      font-weight: 300;
      font-size: 14px;
      color: #000000;
      margin-bottom: 8px;
      line-height: 1.4;
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
      font-weight: 300;
      font-size: 10px;
      color: rgba(0, 0, 0, 0.38);
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
      font-weight: 400;
      font-size: 12px;
      color: #000000;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .rewind-result-url {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
      font-weight: 300;
      font-size: 10px;
      color: rgba(0, 0, 0, 0.38);
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
      font-weight: 300;
      font-size: 10px;
      color: rgba(0, 0, 0, 0.38);
      padding: 40px 20px;
      line-height: 1.6;
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

    /* Chat Styles */
    .rewind-chat-messages {
      flex: 1;
      overflow-y: auto;
      overflow-x: hidden;
      display: flex;
      flex-direction: column;
      gap: 16px;
      padding-bottom: 12px;
    }

    .rewind-chat-messages::-webkit-scrollbar {
      width: 6px;
    }

    .rewind-chat-messages::-webkit-scrollbar-track {
      background: transparent;
    }

    .rewind-chat-messages::-webkit-scrollbar-thumb {
      background: rgba(0, 0, 0, 0.1);
      border-radius: 3px;
    }

    .rewind-chat-empty {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      justify-content: center;
      padding: 40px 20px;
      gap: 16px;
    }

    .rewind-chat-empty-title {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
      font-weight: 300;
      font-size: 16px;
      color: #000000;
      text-align: left;
      line-height: 1.4;
      width: 100%;
    }

    .rewind-chat-empty-subtitle {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
      font-weight: 300;
      font-size: 10px;
      color: rgba(0, 0, 0, 0.38);
      text-align: left;
      line-height: 1.6;
      width: 100%;
    }

    .rewind-chat-empty-input-container {
      display: flex;
      gap: 0;
      align-items: center;
      width: 100%;
      margin-top: 8px;
      position: relative;
      border: 1px solid #E5E5E5;
      border-radius: 3px;
      background: #FFFFFF;
      height: 40px;
      transition: all 0.3s ease;
    }

    .rewind-chat-empty-input-container:focus-within {
      border-color: rgba(0, 0, 0, 0.2);
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
    }

    .rewind-chat-empty-input {
      flex: 1;
      height: 100%;
      padding: 0 14px;
      border: none;
      background: transparent;
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
      font-weight: 400;
      font-size: 12px;
      color: #000000;
      outline: none;
    }

    .rewind-chat-empty-input::placeholder {
      color: rgba(0, 0, 0, 0.4);
    }

    .rewind-chat-empty-send-btn {
      width: 40px;
      height: 100%;
      border: none;
      background: transparent;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.2s ease;
      flex-shrink: 0;
      padding: 0;
    }

    .rewind-chat-empty-send-btn img {
      width: 16px;
      height: 16px;
      opacity: 0.6;
      transition: opacity 0.2s ease;
    }

    .rewind-chat-empty-send-btn:hover img {
      opacity: 1;
    }

    .rewind-chat-empty-send-btn:active {
      transform: scale(0.95);
    }

    .rewind-chat-empty-send-btn:disabled {
      cursor: not-allowed;
      opacity: 0.3;
    }

    .rewind-chat-message {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .rewind-chat-message-user {
      align-items: flex-end;
    }

    .rewind-chat-message-assistant {
      align-items: flex-start;
    }

    .rewind-chat-bubble {
      max-width: 85%;
      padding: 10px 14px;
      border-radius: 3px;
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
      font-weight: 400;
      font-size: 12px;
      line-height: 1.5;
      word-wrap: break-word;
    }

    .rewind-chat-message-user .rewind-chat-bubble {
      background: #FFFFFF;
      color: #000000;
    }

    .rewind-chat-message-assistant .rewind-chat-bubble {
      background: #FFFFFF;
      color: #000000;
    }

    /* Source Badge Styles */
    .rewind-source-badge {
      display: inline-block;
      padding: 1px 6px;
      margin: 0 1px;
      background: #E0E0E0;
      color: #5A5A5A;
      border-radius: 6px;
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
      font-weight: 500;
      font-size: 10px;
      line-height: 1.4;
      cursor: pointer;
      transition: all 0.2s ease;
      vertical-align: baseline;
      white-space: nowrap;
    }

    .rewind-source-badge:hover {
      background: #C0C0C0;
      color: #3A3A3A;
      text-decoration: underline;
    }

    .rewind-source-badge:active {
      background: #A8A8A8;
      transform: scale(0.95);
    }

    .rewind-chat-sources {
      max-width: 85%;
      padding: 10px;
      background: rgba(0, 0, 0, 0.03);
      border-radius: 8px;
      margin-top: 4px;
    }

    .rewind-chat-sources-title {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
      font-weight: 500;
      font-size: 10px;
      color: rgba(0, 0, 0, 0.6);
      margin-bottom: 6px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .rewind-chat-source-item {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
      font-weight: 400;
      font-size: 11px;
      color: rgba(0, 0, 0, 0.7);
      padding: 4px 0;
      cursor: pointer;
      transition: color 0.2s ease;
    }

    .rewind-chat-source-item:hover {
      color: #000000;
      text-decoration: underline;
    }

    .rewind-chat-input-container {
      flex-shrink: 0;
      display: flex;
      gap: 0;
      align-items: center;
      position: relative;
      border: 1px solid #E5E5E5;
      border-radius: 3px;
      background: #FFFFFF;
      height: 40px;
      transition: all 0.3s ease;
    }

    .rewind-chat-input-container:focus-within {
      border-color: rgba(0, 0, 0, 0.2);
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
    }

    .rewind-chat-input {
      flex: 1;
      height: 100%;
      padding: 0 14px;
      border: none;
      background: transparent;
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
      font-weight: 400;
      font-size: 12px;
      color: #000000;
      outline: none;
    }

    .rewind-chat-input::placeholder {
      color: rgba(0, 0, 0, 0.4);
    }

    .rewind-chat-send-btn {
      width: 40px;
      height: 100%;
      border: none;
      background: transparent;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.2s ease;
      flex-shrink: 0;
      padding: 0;
    }

    .rewind-chat-send-btn img,
    .rewind-send-icon-img {
      width: 16px;
      height: 16px;
      opacity: 0.6;
      transition: opacity 0.2s ease;
    }

    .rewind-chat-send-btn:hover img,
    .rewind-send-icon-img:hover {
      opacity: 1;
    }

    .rewind-chat-send-btn:active {
      transform: scale(0.95);
    }

    .rewind-chat-send-btn:disabled {
      cursor: not-allowed;
      opacity: 0.3;
    }

    .rewind-chat-loading {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 10px 14px;
      background: rgba(0, 0, 0, 0.05);
      border-radius: 12px;
      max-width: 85%;
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
      font-weight: 400;
      font-size: 12px;
      color: rgba(0, 0, 0, 0.6);
    }

    .rewind-chat-loading-spinner {
      width: 12px;
      height: 12px;
      border: 2px solid rgba(0, 0, 0, 0.1);
      border-top-color: rgba(0, 0, 0, 0.6);
      border-radius: 50%;
      animation: rewindSpin 0.6s linear infinite;
    }

    @keyframes rewindSpin {
      to { transform: rotate(360deg); }
    }
  `;

    document.head.appendChild(style);
    loggers.sidebar.debug('Styles successfully injected');
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

  // Tab switching
  const askTab = sidebarContainer.querySelector('#rewindAskTab');
  const searchTab = sidebarContainer.querySelector('#rewindSearchTab');
  const askContent = sidebarContainer.querySelector('#rewindAskContent');
  const searchContent = sidebarContainer.querySelector('#rewindSearchContent');

  askTab?.addEventListener('click', () => {
    askTab.classList.add('rewind-tab-active');
    searchTab?.classList.remove('rewind-tab-active');
    askContent?.classList.add('rewind-tab-content-active');
    searchContent?.classList.remove('rewind-tab-content-active');
  });

  searchTab?.addEventListener('click', () => {
    searchTab.classList.add('rewind-tab-active');
    askTab?.classList.remove('rewind-tab-active');
    searchContent?.classList.add('rewind-tab-content-active');
    askContent?.classList.remove('rewind-tab-content-active');
  });

  // Search input
  const searchInput = sidebarContainer.querySelector('#rewindSearchInput') as HTMLInputElement;
  let searchTimeout: ReturnType<typeof setTimeout> | null = null;

  searchInput?.addEventListener('input', (e) => {
    const query = (e.target as HTMLInputElement).value.trim();

    if (searchTimeout) {
      clearTimeout(searchTimeout);
    }

    if (!query) {
      activeSearchQuery = null;
      loadAllHistory();
      return;
    }

    searchTimeout = setTimeout(() => {
      activeSearchQuery = query;

      if (refreshTimeout) {
        clearTimeout(refreshTimeout);
        refreshTimeout = null;
      }

      performSearch(query);
    }, 300);
  });

  // Clear history button
  const clearBtn = sidebarContainer.querySelector('#rewindClearHistoryBtn');
  clearBtn?.addEventListener('click', clearHistory);

  // Chat input and send button (regular)
  const chatInput = sidebarContainer.querySelector('#rewindChatInput') as HTMLInputElement;
  const chatSendBtn = sidebarContainer.querySelector('#rewindChatSendBtn') as HTMLButtonElement;

  const sendChatMessage = () => {
    const question = chatInput.value.trim();
    if (question) {
      askQuestion(question);
      chatInput.value = '';
    }
  };

  chatSendBtn?.addEventListener('click', sendChatMessage);

  chatInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendChatMessage();
    }
  });

  // Chat input and send button (empty state)
  const chatEmptyInput = sidebarContainer.querySelector('#rewindChatEmptyInput') as HTMLInputElement;
  const chatEmptySendBtn = sidebarContainer.querySelector('#rewindChatEmptySendBtn') as HTMLButtonElement;

  const sendEmptyChatMessage = () => {
    const question = chatEmptyInput.value.trim();
    if (question) {
      askQuestion(question);
      chatEmptyInput.value = '';
    }
  };

  chatEmptySendBtn?.addEventListener('click', sendEmptyChatMessage);

  chatEmptyInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendEmptyChatMessage();
    }
  });
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
  if (activeSearchQuery) {
    performSearch(activeSearchQuery);
  } else {
    loadAllHistory();
  }
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
function handlePageIndexed(pageInfo: { id: string; url: string; title: string; timestamp: number; isUpdate: boolean }): void {
  console.log('[Rewind Sidebar] Page indexed:', pageInfo.title, pageInfo.isUpdate ? '(updated)' : '(new)');

  // Only refresh if sidebar is open
  if (!sidebarOpen) {
    console.log('[Rewind Sidebar] Sidebar not open, skipping refresh');
    return;
  }

  // Check if user is actively searching
  if (activeSearchQuery) {
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
  if (activeSearchQuery) {
    return;
  }

  const resultsContainer = sidebarContainer?.querySelector('#rewindResultsContainer');
  if (!resultsContainer) return;

  resultsContainer.innerHTML = '<div class="rewind-loading"><div class="rewind-skeleton-item"><div class="rewind-skeleton-time"></div><div class="rewind-skeleton-icon"></div><div class="rewind-skeleton-text"></div></div></div>';

  try {
    if (typeof chrome === 'undefined' || !chrome.runtime) {
      throw new Error('Chrome runtime not available');
    }
    
    const response = await chrome.runtime.sendMessage({ type: 'GET_ALL_PAGES' });
    
    if (response && response.success && response.pages) {
      renderResults(response.pages, false);
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
      renderResults(response.results, true);
    } else {
      activeSearchQuery = null;
      showEmptyState();
    }
  } catch (error) {
    console.error('[Rewind Sidebar] Error searching:', error);
    activeSearchQuery = null;
    showEmptyState();
  }
}

/**
 * Render results
 */
function renderResults(pages: any[], isSearch: boolean = true): void {
  const resultsContainer = sidebarContainer?.querySelector('#rewindResultsContainer');
  if (!resultsContainer) return;

  if (!pages || pages.length === 0) {
    showEmptyState();
    return;
  }

  const pagesToDisplay = isSearch
    ? [...pages].sort((a, b) => {
        const simA = typeof a.similarity === 'number' ? a.similarity : -Infinity;
        const simB = typeof b.similarity === 'number' ? b.similarity : -Infinity;
        if (simB !== simA) return simB - simA;
        return (b.timestamp || 0) - (a.timestamp || 0);
      })
    : [...pages].sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

  const grouped = groupPagesByDate(pagesToDisplay);
  
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
function groupPagesByDate(pages: any[]): Record<string, any[]> {
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

/**
 * Ask a question using RAG
 */
async function askQuestion(question: string): Promise<void> {
  const chatMessages = sidebarContainer?.querySelector('#rewindChatMessages');
  const chatInput = sidebarContainer?.querySelector('#rewindChatInput') as HTMLInputElement;
  const chatSendBtn = sidebarContainer?.querySelector('#rewindChatSendBtn') as HTMLButtonElement;
  const chatInputContainer = sidebarContainer?.querySelector('.rewind-chat-input-container') as HTMLElement;

  if (!chatMessages) return;

  // Remove empty state if present and show regular chat input
  const emptyState = chatMessages.querySelector('.rewind-chat-empty');
  if (emptyState) {
    emptyState.remove();
    if (chatInputContainer) {
      chatInputContainer.style.display = 'flex';
    }
  }

  // Add user message
  addChatMessage('user', question);

  // Show loading indicator
  const loadingEl = document.createElement('div');
  loadingEl.className = 'rewind-chat-loading';
  loadingEl.innerHTML = `
    <div class="rewind-chat-loading-spinner"></div>
    <span>Thinking...</span>
  `;
  chatMessages.appendChild(loadingEl);
  scrollChatToBottom();

  // Disable input while processing
  if (chatInput) chatInput.disabled = true;
  if (chatSendBtn) chatSendBtn.disabled = true;

  try {
    if (typeof chrome === 'undefined' || !chrome.runtime) {
      throw new Error('Chrome runtime not available');
    }

    // Check RAG availability first
    const availabilityResponse = await chrome.runtime.sendMessage({
      type: 'CHECK_RAG_AVAILABILITY',
    });

    if (!availabilityResponse || !availabilityResponse.available) {
      throw new Error(
        'AI features require Chrome 138+ with Gemini Nano. Please ensure Chrome AI is enabled.'
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

    // Remove loading indicator
    loadingEl.remove();

    if (response && response.success && response.result) {
      // Add assistant message with answer
      addChatMessage('assistant', response.result.answer, response.result.sources);
    } else {
      throw new Error(response?.error || 'Failed to get answer');
    }
  } catch (error) {
    console.error('[Rewind Sidebar] Error asking question:', error);

    // Remove loading indicator
    loadingEl.remove();

    // Add error message
    const errorMessage = error instanceof Error ? error.message : 'Failed to answer question';
    addChatMessage('assistant', `Sorry, I encountered an error: ${errorMessage}`);
  } finally {
    // Re-enable input
    if (chatInput) chatInput.disabled = false;
    if (chatSendBtn) chatSendBtn.disabled = false;
    if (chatInput) chatInput.focus();
  }
}

/**
 * Add a chat message to the UI
 */
function addChatMessage(role: 'user' | 'assistant', content: string, sources?: any[]): void {
  const chatMessages = sidebarContainer?.querySelector('#rewindChatMessages');
  if (!chatMessages) return;

  const messageEl = document.createElement('div');
  messageEl.className = `rewind-chat-message rewind-chat-message-${role}`;

  const bubbleEl = document.createElement('div');
  bubbleEl.className = 'rewind-chat-bubble';

  // For assistant messages with sources, replace [Source N] with styled badges
  if (role === 'assistant' && sources && sources.length > 0) {
    const processedContent = content.replace(/\[Source (\d+)\]/g, (match, num) => {
      const sourceIndex = parseInt(num) - 1;
      if (sourceIndex >= 0 && sourceIndex < sources.length) {
        const source = sources[sourceIndex];
        const escapedUrl = escapeHtml(source.page.url);
        return `<span class="rewind-source-badge" data-source-url="${escapedUrl}" data-source-num="${num}">${num}</span>`;
      }
      return match;
    });
    bubbleEl.innerHTML = processedContent;

    // Add click handlers to source badges
    setTimeout(() => {
      bubbleEl.querySelectorAll('.rewind-source-badge').forEach((badge) => {
        badge.addEventListener('click', (e) => {
          e.stopPropagation();
          const url = (e.target as HTMLElement).getAttribute('data-source-url');
          if (url) {
            window.open(url, '_blank');
          }
        });
      });
    }, 0);
  } else {
    bubbleEl.textContent = content;
  }

  messageEl.appendChild(bubbleEl);

  // Add sources if available (for assistant messages)
  if (role === 'assistant' && sources && sources.length > 0) {
    const sourcesEl = document.createElement('div');
    sourcesEl.className = 'rewind-chat-sources';

    const titleEl = document.createElement('div');
    titleEl.className = 'rewind-chat-sources-title';
    titleEl.textContent = `Sources (${sources.length})`;
    sourcesEl.appendChild(titleEl);

    sources.forEach((source, index) => {
      const sourceItem = document.createElement('div');
      sourceItem.className = 'rewind-chat-source-item';
      sourceItem.textContent = `• (${index + 1}) ${source.page.title || 'Untitled'}`;
      sourceItem.addEventListener('click', () => {
        window.open(source.page.url, '_blank');
      });
      sourcesEl.appendChild(sourceItem);
    });

    messageEl.appendChild(sourcesEl);
  }

  chatMessages.appendChild(messageEl);
  scrollChatToBottom();
}

/**
 * Scroll chat to bottom
 */
function scrollChatToBottom(): void {
  const chatMessages = sidebarContainer?.querySelector('#rewindChatMessages');
  if (chatMessages) {
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }
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

