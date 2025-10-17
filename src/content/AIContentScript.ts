/**
 * AI Content Script - Handles Chrome AI API calls from content scripts
 * Chrome AI APIs (including Summarizer) are only available in content scripts, not service workers
 */

console.log('[AIContentScript] Initializing AI content script...');

// Make this file a module to fix TypeScript global scope augmentation
export {};

/**
 * Chrome AI Summarizer API types
 */
declare global {
  // Summarizer API is a global constructor, not on window.ai
  var Summarizer: {
    availability(): Promise<'available' | 'downloadable' | 'unavailable'>;
    create(options?: {
      type?: 'key-points' | 'tldr' | 'headline' | 'teaser';
      format?: 'markdown' | 'plain-text';
      length?: 'short' | 'medium' | 'long';
      sharedContext?: string;
      language?: string;
      monitor?: (m: any) => void;
    }): Promise<{
      summarize(text: string, context?: { context?: string }): Promise<string>;
      summarizeStreaming(text: string, context?: { context?: string }): AsyncIterable<string>;
      destroy(): Promise<void>;
    }>;
  };

  interface Window {
    testChromeSummarizer?: (text?: string) => Promise<string | null>;
    testExtensionCommunication?: () => Promise<any>;
  }
}

/**
 * Check if Chrome Summarizer API is available
 */
async function checkSummarizerAvailability(): Promise<boolean> {
  try {
    // Check if Summarizer API is supported
    if (!('Summarizer' in self)) {
      console.log('[AIContentScript] Chrome Summarizer API not supported');
      return false;
    }

    const availability = await Summarizer.availability();
    console.log('[AIContentScript] Summarizer availability:', availability);

    return availability === 'available' || availability === 'downloadable';
  } catch (error) {
    console.warn('[AIContentScript] Error checking summarizer availability:', error);
    return false;
  }
}

/**
 * Generate summary using Chrome Summarizer API
 */
async function summarizeWithChromeAPI(
  text: string,
  context: string,
  maxLength: number
): Promise<string> {
  // Check if Summarizer API is available
  if (!('Summarizer' in self)) {
    throw new Error('Chrome Summarizer API not available');
  }

  // Determine summary type and length based on maxLength
  let summaryType: 'key-points' | 'tldr' | 'teaser' = 'tldr';
  let summaryLength: 'short' | 'medium' | 'long' = 'medium';

  if (maxLength < 300) {
    summaryType = 'teaser';
    summaryLength = 'short';
  } else if (maxLength < 600) {
    summaryType = 'tldr';
    summaryLength = 'medium';
  } else {
    summaryType = 'key-points';
    summaryLength = 'long';
  }

  console.log('[AIContentScript] Creating summarizer with context:', context);
  console.log('[AIContentScript] Summary type:', summaryType, 'length:', summaryLength);

  // Check for user activation before creating the summarizer
  if (!navigator.userActivation.isActive) {
    console.log('[AIContentScript] User activation not available, falling back to extractive summarization');
    throw new Error('User activation required for Chrome Summarizer API - Please interact with the page first');
  }

  // Create summarizer with simple options and timeout
  console.log('[AIContentScript] Creating summarizer with options:', {
    type: summaryType,
    format: 'plain-text',
    length: summaryLength
  });

  const summarizer = await Promise.race([
    Summarizer.create({
      type: summaryType,
      format: 'plain-text',
      length: summaryLength,
    }),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Summarizer creation timed out')), 10000)
    ),
  ]);

  try {
    // Generate summary with timeout - simple version
    console.log('[AIContentScript] Generating summary...');
    const summary = await Promise.race([
      summarizer.summarize(text),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Summarization timed out')), 30000)
      ),
    ]);

    if (!summary || typeof summary !== 'string') {
      throw new Error('Invalid summary response from API');
    }

    console.log('[AIContentScript] Generated summary length:', summary.length);

    // Ensure it's not too long
    const trimmed = summary.length > maxLength
      ? summary.substring(0, maxLength) + '...'
      : summary;

    return trimmed;
  } finally {
    try {
      await summarizer.destroy();
      console.log('[AIContentScript] Summarizer destroyed successfully');
    } catch (error) {
      console.warn('[AIContentScript] Error destroying summarizer:', error);
    }
  }
}

/**
 * Handle messages from service worker
 */
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  console.log('[AIContentScript] Received message:', message.type);

  if (message.type === 'AI_SUMMARIZE') {
    // Handle asynchronously
    (async () => {
      try {
        const { text, url, title, maxLength } = message.data;

        // Build context from URL and title
        const context = buildSearchContext(url, title);

        console.log('[AIContentScript] Summarizing text of length:', text.length);

        const summary = await summarizeWithChromeAPI(text, context, maxLength);

        console.log('[AIContentScript] Summarization successful');

        sendResponse({
          success: true,
          summary,
        });
      } catch (error) {
        console.error('[AIContentScript] Summarization failed:', error);
        sendResponse({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    })();

    return true; // Keep message channel open for async response
  }

  if (message.type === 'AI_CHECK_AVAILABILITY') {
    (async () => {
      const isAvailable = await checkSummarizerAvailability();
      sendResponse({ isAvailable });
    })();

    return true; // Keep message channel open for async response
  }

  return false; // Don't keep channel open for other messages
});

/**
 * Build search context from URL and title
 */
function buildSearchContext(url: string, title: string): string {
  try {
    const urlObj = new URL(url);
    const domain = urlObj.hostname.replace('www.', '');

    // Extract first part of path for topic hints
    const pathParts = urlObj.pathname.split('/').filter(p => p.length > 0);
    const topicHint = pathParts.length > 0 ? pathParts[0] : '';

    // Build context string
    let context = `Technical documentation from ${domain}`;

    if (title) {
      // Extract key terms from title (remove common words)
      const titleWords = title
        .toLowerCase()
        .replace(/[^\w\s]/g, '')
        .split(/\s+/)
        .filter(w => w.length > 3 && !['docs', 'documentation', 'tutorial', 'guide', 'reference'].includes(w));

      if (titleWords.length > 0) {
        context += ` about ${titleWords.slice(0, 3).join(', ')}`;
      }
    }

    if (topicHint && topicHint.length > 2) {
      context += `. Topic: ${topicHint}`;
    }

    return context;
  } catch (error) {
    // If URL parsing fails, just use title
    return title ? `Documentation about ${title}` : 'Technical documentation';
  }
}

// Add a global test function for direct console testing
window.testChromeSummarizer = async function(text: string = "This is a test sentence for the Chrome Summarizer API. It should be able to process this text and generate a meaningful summary.") {
  console.log('[Direct Test] Starting Chrome Summarizer API test...');

  try {
    // Check API availability
    if (!('Summarizer' in self)) {
      console.error('[Direct Test] Summarizer API not available');
      return null;
    }

    console.log('[Direct Test] User activation:', navigator.userActivation.isActive);

    // Check availability
    const availability = await Summarizer.availability();
    console.log('[Direct Test] Availability:', availability);

    if (availability !== 'available' && availability !== 'downloadable') {
      console.error('[Direct Test] Summarizer not available:', availability);
      return null;
    }

    // Check user activation
    if (!navigator.userActivation.isActive) {
      console.error('[Direct Test] User activation required - interact with the page first');
      return null;
    }

    // Create summarizer
    console.log('[Direct Test] Creating summarizer...');
    const summarizer = await Summarizer.create({
      type: 'tldr',
      format: 'plain-text',
      length: 'short',
      language: 'en'  // Add language to avoid the warning
    });

    try {
      // Generate summary
      console.log('[Direct Test] Generating summary...');
      const summary = await summarizer.summarize(text);
      console.log('[Direct Test] ✅ SUCCESS! Summary:', summary);
      return summary;
    } finally {
      await summarizer.destroy();
      console.log('[Direct Test] Summarizer destroyed');
    }

  } catch (error) {
    console.error('[Direct Test] Error:', error);
    return null;
  }
};

// Add a function to test extension communication
window.testExtensionCommunication = async function() {
  console.log('[Extension Test] Testing extension message communication...');

  try {
    const response = await chrome.runtime.sendMessage({
      type: 'AI_CHECK_AVAILABILITY'
    });

    console.log('[Extension Test] ✅ Extension communication successful:', response);
    return response;
  } catch (error) {
    console.error('[Extension Test] ❌ Extension communication failed:', error);
    return null;
  }
};

// Initialize and check availability
checkSummarizerAvailability().then(isAvailable => {
  console.log('[AIContentScript] Chrome Summarizer API available:', isAvailable);

  // Debug: Log what we found
  if (typeof window !== 'undefined') {
    console.log('[AIContentScript] Window object available:', !!window);
    console.log('[AIContentScript] Summarizer API exists:', !!('Summarizer' in self));

    if ('Summarizer' in self) {
      console.log('[AIContentScript] Found summarizer API, checking availability...');
      Summarizer.availability().then(availability => {
        console.log('[AIContentScript] Availability result:', availability);
      }).catch((err: any) => {
        console.error('[AIContentScript] Error checking availability:', err);
      });
    }
  } else {
    console.log('[AIContentScript] Window object not available (content script context issue)');
  }
});