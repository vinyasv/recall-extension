/**
 * Offscreen Summarizer - Handles Chrome AI Summarizer API calls in offscreen document
 * This bypasses user activation requirements by maintaining activation state
 */

console.log('[Offscreen Summarizer] Initializing AI summarizer...');

// Make this file a module to fix TypeScript global scope augmentation
export {};

/**
 * Chrome AI Summarizer API types
 */
declare global {
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
}

interface SummarizeRequest {
  id: string;
  text: string;
  url: string;
  title: string;
  maxLength: number;
  timestamp: number;
}

interface SummarizeResponse {
  id: string;
  success: boolean;
  summary?: string;
  error?: string;
  processingTime: number;
  apiType: string;
}

class OffscreenSummarizer {
  private isAvailable: boolean = false;
  private isInitialized: boolean = false;
  private processingQueue: SummarizeRequest[] = [];
  private isProcessing: boolean = false;

  /**
   * Initialize the offscreen summarizer
   */
  async initialize(): Promise<void> {
    console.log('[Offscreen Summarizer] Initializing...');

    try {
      // Check if Summarizer API is available
      if (!('Summarizer' in self)) {
        console.warn('[Offscreen Summarizer] Chrome Summarizer API not supported');
        this.updateStatus('Chrome Summarizer API not supported', 'error');
        return;
      }

      const availability = await Summarizer.availability();
      console.log('[Offscreen Summarizer] API availability:', availability);

      if (availability === 'available' || availability === 'downloadable') {
        this.isAvailable = true;
        this.updateStatus('Chrome Summarizer API ready', 'ready');
        console.log('[Offscreen Summarizer] ✅ Chrome Summarizer API is available');
      } else {
        this.updateStatus(`API not available: ${availability}`, 'error');
        console.warn('[Offscreen Summarizer] Summarizer not available:', availability);
      }

      this.isInitialized = true;

    } catch (error) {
      console.error('[Offscreen Summarizer] Initialization failed:', error);
      this.updateStatus(`Initialization failed: ${error}`, 'error');
    }
  }

  /**
   * Update status display
   */
  private updateStatus(message: string, type: 'processing' | 'ready' | 'error' = 'ready'): void {
    const statusEl = document.getElementById('status');
    if (statusEl) {
      statusEl.textContent = message;
      statusEl.className = `status ${type}`;
    }
  }

  /**
   * Update queue display
   */
  private updateQueueDisplay(): void {
    const queueContainer = document.getElementById('queueContainer');
    const queueList = document.getElementById('queueList');

    if (!queueContainer || !queueList) return;

    if (this.processingQueue.length > 0) {
      queueContainer.classList.remove('hidden');
      queueList.innerHTML = this.processingQueue.map(item => `
        <div class="queue-item">
          <strong>${item.title}</strong><br>
          <small>${item.text.length} chars → ${item.maxLength} chars max</small>
        </div>
      `).join('');
    } else {
      queueContainer.classList.add('hidden');
    }
  }

  /**
   * Process a single summarization request
   */
  private async processRequest(request: SummarizeRequest): Promise<SummarizeResponse> {
    const startTime = Date.now();

    try {
      console.log(`[Offscreen Summarizer] Processing request ${request.id}:`, request.title);

      if (!this.isAvailable) {
        throw new Error('Chrome Summarizer API not available');
      }

      // Determine summary type and length based on maxLength
      let summaryType: 'key-points' | 'tldr' | 'teaser' = 'tldr';
      let summaryLength: 'short' | 'medium' | 'long' = 'medium';

      if (request.maxLength < 300) {
        summaryType = 'teaser';
        summaryLength = 'short';
      } else if (request.maxLength < 600) {
        summaryType = 'tldr';
        summaryLength = 'medium';
      } else {
        summaryType = 'key-points';
        summaryLength = 'long';
      }

      // Build context from URL and title
      const context = this.buildContext(request.url, request.title);

      console.log(`[Offscreen Summarizer] Creating summarizer: type=${summaryType}, length=${summaryLength}`);

      // Create summarizer with timeout
      const summarizer = await Promise.race([
        Summarizer.create({
          type: summaryType,
          format: 'plain-text',
          length: summaryLength,
          language: 'en'
        }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Summarizer creation timed out')), 10000)
        ),
      ]);

      try {
        // Generate summary with timeout
        const summary = await Promise.race([
          summarizer.summarize(request.text, { context }),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('Summarization timed out')), 30000)
          ),
        ]);

        if (!summary || typeof summary !== 'string') {
          throw new Error('Invalid summary response from API');
        }

        // Ensure it's not too long
        const trimmed = summary.length > request.maxLength
          ? summary.substring(0, request.maxLength) + '...'
          : summary;

        const processingTime = Date.now() - startTime;

        console.log(`[Offscreen Summarizer] ✅ Request ${request.id} completed in ${processingTime}ms`);
        console.log(`[Offscreen Summarizer] Summary length: ${trimmed.length} chars`);

        return {
          id: request.id,
          success: true,
          summary: trimmed,
          processingTime,
          apiType: 'Chrome Summarizer (Offscreen)'
        };

      } finally {
        try {
          await summarizer.destroy();
          console.log(`[Offscreen Summarizer] Summarizer for request ${request.id} destroyed`);
        } catch (error) {
          console.warn(`[Offscreen Summarizer] Error destroying summarizer:`, error);
        }
      }

    } catch (error) {
      const processingTime = Date.now() - startTime;
      console.error(`[Offscreen Summarizer] ❌ Request ${request.id} failed:`, error);

      return {
        id: request.id,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        processingTime,
        apiType: 'Chrome Summarizer (Offscreen - Failed)'
      };
    }
  }

  /**
   * Process queue of requests
   */
  private async processQueue(): Promise<void> {
    if (this.isProcessing || this.processingQueue.length === 0) {
      return;
    }

    this.isProcessing = true;
    this.updateStatus('Processing summarization requests...', 'processing');

    while (this.processingQueue.length > 0) {
      const request = this.processingQueue.shift()!;
      this.updateQueueDisplay();

      const response = await this.processRequest(request);

      // Send response back to service worker
      chrome.runtime.sendMessage({
        type: 'SUMMARIZER_RESPONSE',
        response
      }).catch(error => {
        console.error('[Offscreen Summarizer] Failed to send response:', error);
      });
    }

    this.isProcessing = false;
    this.updateStatus('Chrome Summarizer API ready', 'ready');
  }

  /**
   * Build search context from URL and title
   */
  private buildContext(url: string, title: string): string {
    try {
      const urlObj = new URL(url);
      const domain = urlObj.hostname.replace('www.', '');

      // Extract first part of path for topic hints
      const pathParts = urlObj.pathname.split('/').filter(p => p.length > 0);
      const topicHint = pathParts.length > 0 ? pathParts[0] : '';

      // Build context string
      let context = `Technical documentation from ${domain}`;

      if (title) {
        // Extract key terms from title
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
      return title ? `Documentation about ${title}` : 'Technical documentation';
    }
  }

  /**
   * Add summarization request to queue
   */
  public addRequest(request: SummarizeRequest): void {
    console.log(`[Offscreen Summarizer] Adding request to queue: ${request.id}`);
    this.processingQueue.push(request);
    this.updateQueueDisplay();

    // Process queue asynchronously
    this.processQueue();
  }

  /**
   * Check if API is available
   */
  public isApiAvailable(): boolean {
    return this.isAvailable && this.isInitialized;
  }

  /**
   * Get current status
   */
  public getStatus(): { available: boolean; initialized: boolean; queueSize: number; processing: boolean } {
    return {
      available: this.isAvailable,
      initialized: this.isInitialized,
      queueSize: this.processingQueue.length,
      processing: this.isProcessing
    };
  }
}

// Create and initialize the summarizer
const offscreenSummarizer = new OffscreenSummarizer();

// Handle messages from service worker
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  console.log('[Offscreen Summarizer] Received message:', message.type);

  if (message.type === 'SUMMARIZE_REQUEST') {
    // Handle asynchronously
    const request: SummarizeRequest = message.request;
    offscreenSummarizer.addRequest(request);

    // Send immediate acknowledgment
    sendResponse({
      success: true,
      message: 'Request added to queue',
      queueSize: offscreenSummarizer.getStatus().queueSize
    });
    return true;
  }

  if (message.type === 'SUMMARIZER_STATUS') {
    const status = offscreenSummarizer.getStatus();
    sendResponse({ success: true, status });
    return true;
  }

  return false;
});

// Initialize when ready
offscreenSummarizer.initialize();

// Send ready signal to service worker
chrome.runtime.sendMessage({
  type: 'OFFSCREEN_SUMMARIZER_READY'
}).catch(error => {
  console.warn('[Offscreen Summarizer] Could not signal ready state:', error);
});

console.log('[Offscreen Summarizer] Service worker message handlers configured');