/**
 * Memex Content Script
 * Extracts page content for indexing
 * This will be injected into web pages
 */

import { ContentExtractor } from './ContentExtractor';
import { createSidebar } from './sidebar';

console.log('[Memex] Content script loaded');

// Initialize sidebar overlay when DOM is ready
if (document.readyState === 'loading') {
  console.log('[Memex] DOM is loading, waiting for DOMContentLoaded...');
  document.addEventListener('DOMContentLoaded', () => {
    console.log('[Memex] DOM ready, creating sidebar...');
    createSidebar();
  });
} else {
  console.log('[Memex] DOM already ready, creating sidebar immediately...');
  createSidebar();
}

// Also try to initialize after a delay for SPAs
setTimeout(() => {
  console.log('[Memex] Delayed initialization for SPAs...');
  createSidebar(); // Will skip if already created
}, 1000);

/**
 * Listen for messages from background script
 */
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'EXTRACT_CONTENT') {
    try {
      (async () => {
        const data = await ContentExtractor.extract();
        sendResponse({ success: true, data });
      })();
    } catch (error) {
      console.error('[Memex] Failed to extract content:', error);
      sendResponse({ success: false, error: (error as Error).message });
    }
  }

  return true; // Keep message channel open
});

// Notify background that content script is ready
chrome.runtime.sendMessage({ type: 'CONTENT_SCRIPT_READY' }).catch(() => {
  // Ignore errors if background script is not ready
});

console.log('[Memex] Content script ready');
