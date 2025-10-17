/**
 * OffscreenManager - Manages offscreen document for Chrome AI API access
 * Handles creation, lifecycle, and communication with offscreen summarizer
 */

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

interface SummarizeCallbacks {
  resolve: (value: string) => void;
  reject: (reason?: any) => void;
}

export class OffscreenManager {
  private static instance: OffscreenManager;
  private isOffscreenOpen: boolean = false;
  private pendingRequests: Map<string, SummarizeCallbacks> = new Map();
  private requestIdCounter: number = 0;
  private creationPromise: Promise<void> | null = null;

  private constructor() {}

  public static getInstance(): OffscreenManager {
    if (!OffscreenManager.instance) {
      OffscreenManager.instance = new OffscreenManager();
    }
    return OffscreenManager.instance;
  }

  /**
   * Ensure offscreen document is open
   */
  public async ensureOffscreenOpen(): Promise<void> {
    // If already open, verify it's still working
    if (this.isOffscreenOpen) {
      try {
        const response = await chrome.runtime.sendMessage({
          type: 'SUMMARIZER_STATUS'
        });
        if (response?.success) {
          return; // It's still open and working
        }
      } catch (error) {
        console.log('[OffscreenManager] Offscreen document not responding, reopening...');
        this.isOffscreenOpen = false;
        this.creationPromise = null;
      }
    }

    // If creation is in progress, wait for it
    if (this.creationPromise) {
      console.log('[OffscreenManager] Offscreen creation already in progress, waiting...');
      await this.creationPromise;
      return;
    }

    // Start creation
    if (!this.isOffscreenOpen) {
      this.creationPromise = this.createOffscreenDocument();
      await this.creationPromise;
    }
  }

  /**
   * Create offscreen document
   */
  private async createOffscreenDocument(): Promise<void> {
    console.log('[OffscreenManager] Creating offscreen document...');

    try {
      // Check if offscreen document already exists
      const existingContexts = await chrome.runtime.getContexts({
        contextTypes: ['OFFSCREEN_DOCUMENT' as any],
        documentUrls: [chrome.runtime.getURL('src/offscreen/summarizer.html')]
      });

      const contexts = await existingContexts;
      if (contexts.length > 0) {
        console.log('[OffscreenManager] Offscreen document already exists');
        this.isOffscreenOpen = true;
        return;
      }

      // Create new offscreen document
      await chrome.offscreen.createDocument({
        url: chrome.runtime.getURL('src/offscreen/summarizer.html'),
        reasons: ['DOM_SCRAPING' as any], // Using DOM_SCRAPING as a valid reason for AI processing
        justification: 'Chrome AI Summarizer API requires DOM context and user activation state'
      });

      console.log('[OffscreenManager] ✅ Offscreen document created');
      this.isOffscreenOpen = true;

      // Wait for ready signal
      await this.waitForReady();

    } catch (error) {
      console.error('[OffscreenManager] Failed to create offscreen document:', error);
      this.isOffscreenOpen = false;
      throw error;
    }
  }

  /**
   * Wait for offscreen document to signal ready
   */
  private async waitForReady(): Promise<void> {
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        console.warn('[OffscreenManager] Timeout waiting for offscreen ready signal');
        resolve(); // Continue anyway
      }, 5000);

      const messageHandler = (message: any) => {
        if (message.type === 'OFFSCREEN_SUMMARIZER_READY') {
          clearTimeout(timeout);
          chrome.runtime.onMessage.removeListener(messageHandler);
          console.log('[OffscreenManager] ✅ Offscreen document ready');
          resolve();
        }
      };

      chrome.runtime.onMessage.addListener(messageHandler);
    });
  }

  /**
   * Close offscreen document
   */
  public async closeOffscreenDocument(): Promise<void> {
    if (this.isOffscreenOpen) {
      try {
        await chrome.offscreen.closeDocument();
        this.isOffscreenOpen = false;
        console.log('[OffscreenManager] Offscreen document closed');
      } catch (error) {
        console.error('[OffscreenManager] Failed to close offscreen document:', error);
      }
    }
  }

  /**
   * Generate unique request ID
   */
  private generateRequestId(): string {
    return `req_${Date.now()}_${++this.requestIdCounter}`;
  }

  /**
   * Send summarization request to offscreen document
   */
  public async summarizeText(
    text: string,
    url: string,
    title: string,
    maxLength: number = 800
  ): Promise<string> {
    await this.ensureOffscreenOpen();

    const requestId = this.generateRequestId();

    return new Promise<string>((resolve, reject) => {
      // Store promise callbacks
      this.pendingRequests.set(requestId, { resolve, reject });

      // Create request object
      const request: SummarizeRequest = {
        id: requestId,
        text,
        url,
        title,
        maxLength,
        timestamp: Date.now()
      };

      // Set timeout for request
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(requestId);
        reject(new Error('Summarization request timed out'));
      }, 60000); // 60 second timeout

      // Update resolve callback to clear timeout
      const originalResolve = resolve;
      const wrappedResolve = (value: string) => {
        clearTimeout(timeout);
        originalResolve(value);
      };

      // Store updated callbacks
      this.pendingRequests.set(requestId, { resolve: wrappedResolve, reject });

      console.log(`[OffscreenManager] Sending summarization request: ${requestId}`);

      // Send request to offscreen document
      chrome.runtime.sendMessage({
        type: 'SUMMARIZE_REQUEST',
        request
      }).catch((error) => {
        clearTimeout(timeout);
        this.pendingRequests.delete(requestId);
        reject(new Error(`Failed to send request to offscreen document: ${error}`));
      });
    });
  }

  /**
   * Handle response from offscreen document
   */
  public handleResponse(response: SummarizeResponse): void {
    const callbacks = this.pendingRequests.get(response.id);

    if (callbacks) {
      this.pendingRequests.delete(response.id);

      if (response.success && response.summary) {
        console.log(`[OffscreenManager] ✅ Request ${response.id} succeeded`);
        callbacks.resolve(response.summary);
      } else {
        console.error(`[OffscreenManager] ❌ Request ${response.id} failed:`, response.error);
        callbacks.reject(new Error(response.error || 'Summarization failed'));
      }
    } else {
      console.warn(`[OffscreenManager] Received response for unknown request: ${response.id}`);
    }
  }

  /**
   * Check if offscreen is ready
   */
  public async isReady(): Promise<boolean> {
    if (!this.isOffscreenOpen) {
      return false;
    }

    try {
      const response = await chrome.runtime.sendMessage({
        type: 'SUMMARIZER_STATUS'
      });
      return response?.success && response.status?.available;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get status information
   */
  public async getStatus(): Promise<{
    isOpen: boolean;
    available: boolean;
    pendingRequests: number;
  }> {
    let available = false;

    if (this.isOffscreenOpen) {
      try {
        const response = await chrome.runtime.sendMessage({
          type: 'SUMMARIZER_STATUS'
        });
        available = response?.success && response.status?.available || false;
      } catch (error) {
        available = false;
      }
    }

    return {
      isOpen: this.isOffscreenOpen,
      available,
      pendingRequests: this.pendingRequests.size
    };
  }

  /**
   * Clean up pending requests
   */
  public cleanup(): void {
    // Reject all pending requests
    for (const [, callbacks] of this.pendingRequests) {
      callbacks.reject(new Error('Offscreen manager shutting down'));
    }
    this.pendingRequests.clear();
  }
}

// Export singleton instance
export const offscreenManager = OffscreenManager.getInstance();