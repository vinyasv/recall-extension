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

interface PromptRequest {
  id: string;
  prompt: string;
  options?: any;
  timestamp: number;
}

interface PromptResponse {
  id: string;
  success: boolean;
  answer?: string;
  error?: string;
  processingTime: number;
}

interface PromptCallbacks {
  resolve: (value: string) => void;
  reject: (reason?: any) => void;
}

export class OffscreenManager {
  private static instance: OffscreenManager;
  private isOffscreenOpen: boolean = false;
  private pendingRequests: Map<string, SummarizeCallbacks> = new Map();
  private pendingPromptRequests: Map<string, PromptCallbacks> = new Map();
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

      console.log('[OffscreenManager] Offscreen document created');
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
          console.log('[OffscreenManager] Offscreen document ready');
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
   * Check Prompt API availability
   */
  public async checkPromptApiAvailability(): Promise<{ available: boolean }> {
    await this.ensureOffscreenOpen();

    try {
      const response = await chrome.runtime.sendMessage({
        type: 'PROMPT_API_STATUS'
      });
      return { available: response?.available || false };
    } catch (error) {
      console.error('[OffscreenManager] Failed to check Prompt API availability:', error);
      return { available: false };
    }
  }

  /**
   * Send prompt to Prompt API (non-streaming)
   */
  public async prompt(prompt: string, options?: any): Promise<string> {
    await this.ensureOffscreenOpen();

    const requestId = this.generateRequestId();

    return new Promise<string>((resolve, reject) => {
      // Store promise callbacks
      this.pendingPromptRequests.set(requestId, { resolve, reject });

      // Create request object
      const request: PromptRequest = {
        id: requestId,
        prompt,
        options,
        timestamp: Date.now()
      };

      // Set timeout for request
      const timeout = setTimeout(() => {
        this.pendingPromptRequests.delete(requestId);
        reject(new Error('Prompt request timed out'));
      }, 120000); // 120 second timeout (prompts can take longer)

      // Update resolve callback to clear timeout
      const originalResolve = resolve;
      const wrappedResolve = (value: string) => {
        clearTimeout(timeout);
        originalResolve(value);
      };

      // Store updated callbacks
      this.pendingPromptRequests.set(requestId, { resolve: wrappedResolve, reject });

      console.log(`[OffscreenManager] Sending prompt request: ${requestId}`);

      // Send request to offscreen document
      chrome.runtime.sendMessage({
        type: 'PROMPT_REQUEST',
        request
      }).catch((error) => {
        clearTimeout(timeout);
        this.pendingPromptRequests.delete(requestId);
        reject(new Error(`Failed to send prompt request to offscreen document: ${error}`));
      });
    });
  }

  /**
   * Send prompt with streaming response
   */
  public async *promptStreaming(
    prompt: string,
    options?: any
  ): AsyncGenerator<string, void, unknown> {
    await this.ensureOffscreenOpen();

    const requestId = this.generateRequestId();

    // Create a channel for streaming chunks
    const chunks: string[] = [];
    let isComplete = false;
    let error: Error | null = null;

    // Set up listener for streaming chunks
    const messageHandler = (message: any) => {
      if (message.type === 'PROMPT_STREAM_CHUNK' && message.requestId === requestId) {
        chunks.push(message.chunk);
      } else if (message.type === 'PROMPT_STREAM_COMPLETE' && message.requestId === requestId) {
        isComplete = true;
        chrome.runtime.onMessage.removeListener(messageHandler);
      } else if (message.type === 'PROMPT_STREAM_ERROR' && message.requestId === requestId) {
        error = new Error(message.error);
        isComplete = true;
        chrome.runtime.onMessage.removeListener(messageHandler);
      }
    };

    chrome.runtime.onMessage.addListener(messageHandler);

    // Send request
    const request: PromptRequest = {
      id: requestId,
      prompt,
      options,
      timestamp: Date.now()
    };

    console.log(`[OffscreenManager] Sending streaming prompt request: ${requestId}`);

    try {
      await chrome.runtime.sendMessage({
        type: 'PROMPT_STREAMING_REQUEST',
        request
      });
    } catch (err) {
      chrome.runtime.onMessage.removeListener(messageHandler);
      throw new Error(`Failed to send streaming request: ${err}`);
    }

    // Yield chunks as they arrive
    let lastYieldedIndex = 0;
    while (!isComplete) {
      if (error) {
        throw error;
      }

      // Yield any new chunks
      while (lastYieldedIndex < chunks.length) {
        yield chunks[lastYieldedIndex];
        lastYieldedIndex++;
      }

      // Wait a bit before checking again
      await new Promise(resolve => setTimeout(resolve, 50));
    }

    // Yield any remaining chunks
    while (lastYieldedIndex < chunks.length) {
      yield chunks[lastYieldedIndex];
      lastYieldedIndex++;
    }
  }

  /**
   * Handle prompt response from offscreen document
   */
  public handlePromptResponse(response: PromptResponse): void {
    const callbacks = this.pendingPromptRequests.get(response.id);

    if (callbacks) {
      this.pendingPromptRequests.delete(response.id);

      if (response.success && response.answer) {
        console.log(`[OffscreenManager] ✅ Prompt request ${response.id} succeeded`);
        callbacks.resolve(response.answer);
      } else {
        console.error(`[OffscreenManager] ❌ Prompt request ${response.id} failed:`, response.error);
        callbacks.reject(new Error(response.error || 'Prompt generation failed'));
      }
    } else {
      console.warn(`[OffscreenManager] Received prompt response for unknown request: ${response.id}`);
    }
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

    for (const [, callbacks] of this.pendingPromptRequests) {
      callbacks.reject(new Error('Offscreen manager shutting down'));
    }
    this.pendingPromptRequests.clear();
  }
}

// Export singleton instance
export const offscreenManager = OffscreenManager.getInstance();