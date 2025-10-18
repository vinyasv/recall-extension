/**
 * Recall Content Script
 * Extracts page content for indexing
 * This will be injected into web pages
 */

import { ContentExtractor } from './ContentExtractor';
import { createSidebar } from './sidebar';

console.log('[Recall] Content script loaded');

// Initialize sidebar overlay when DOM is ready
if (document.readyState === 'loading') {
  console.log('[Recall] DOM is loading, waiting for DOMContentLoaded...');
  document.addEventListener('DOMContentLoaded', () => {
    console.log('[Recall] DOM ready, creating sidebar...');
    createSidebar();
  });
} else {
  console.log('[Recall] DOM already ready, creating sidebar immediately...');
  createSidebar();
}

// Also try to initialize after a delay for SPAs
setTimeout(() => {
  console.log('[Recall] Delayed initialization for SPAs...');
  createSidebar(); // Will skip if already created
}, 1000);

/**
 * Listen for messages from background script
 */
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'EXTRACT_CONTENT') {
    // Handle async extraction properly
    (async () => {
      try {
        console.log('[Recall] Extracting content for:', window.location.href);
        const data = await ContentExtractor.extract();
        console.log('[Recall] Content extraction successful:', data.textLength, 'chars');
        sendResponse({ success: true, data });
      } catch (error) {
        console.error('[Recall] Failed to extract content:', error);
        sendResponse({ success: false, error: (error as Error).message });
      }
    })();

    return true; // MUST return true to keep message channel open for async response
  }

  // Note: TOGGLE_SIDEBAR is handled by sidebar.ts message listener
  // This handler is kept for backward compatibility but sidebar.ts should handle it

  return false; // Default
});

// Notify background that content script is ready
chrome.runtime.sendMessage({ type: 'CONTENT_SCRIPT_READY' }).catch(() => {
  // Ignore errors if background script is not ready
});

console.log('[Recall] Content script ready');
