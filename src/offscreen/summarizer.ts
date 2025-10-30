/**
 * Offscreen Prompt API Handler - Handles Chrome Prompt API calls for RAG
 * This bypasses user activation requirements by maintaining activation state
 */

console.log('[Rewind. Offscreen] Initializing Prompt API...');

// Make this file a module to fix TypeScript global scope augmentation
export {};

/**
 * Chrome Prompt API types
 */
declare global {
  var LanguageModel: {
    availability(): Promise<'available' | 'downloadable' | 'unavailable'>;
    create(options?: {
      temperature?: number;
      topK?: number;
      systemPrompt?: string;
      monitor?: (m: any) => void;
    }): Promise<{
      prompt(text: string): Promise<string>;
      promptStreaming(text: string): AsyncIterable<string>;
      destroy(): Promise<void>;
      countPromptTokens(text: string): Promise<number>;
    }>;
  };
}

interface PromptRequest {
  id: string;
  prompt: string;
  options?: {
    temperature?: number;
    topK?: number;
    systemPrompt?: string;
  };
  timestamp: number;
}

interface PromptResponse {
  id: string;
  success: boolean;
  answer?: string;
  error?: string;
  processingTime: number;
}

class OffscreenPromptHandler {
  private promptApiAvailable: boolean = false;
  private isInitialized: boolean = false;

  /**
   * Initialize the Prompt API
   */
  async initialize(): Promise<void> {
    console.log('[Rewind. Offscreen] Checking Prompt API availability...');

    try {
      // Check if Prompt API is available
      if (!('LanguageModel' in self)) {
        console.warn('[Rewind. Offscreen] Chrome Prompt API not supported');
        return;
      }

      const availability = await LanguageModel.availability();
      console.log('[Rewind. Offscreen] Prompt API availability:', availability);

      if (availability === 'available' || availability === 'downloadable') {
        this.promptApiAvailable = true;
        console.log('[Rewind. Offscreen] ✅ Prompt API is ready');
      } else {
        console.warn('[Rewind. Offscreen] Prompt API not available:', availability);
      }

      this.isInitialized = true;
    } catch (error) {
      console.error('[Rewind. Offscreen] Initialization failed:', error);
      this.isInitialized = true; // Mark as initialized even on error
    }
  }

  /**
   * Check if Prompt API is available
   */
  public isAvailable(): boolean {
    return this.promptApiAvailable && this.isInitialized;
  }

  /**
   * Process a prompt request (non-streaming)
   */
  public async processPromptRequest(request: PromptRequest): Promise<PromptResponse> {
    const startTime = Date.now();

    try {
      console.log(`[Rewind. Offscreen] Processing prompt request ${request.id}`);

      if (!this.promptApiAvailable) {
        throw new Error('Chrome Prompt API not available');
      }

      // Create language model session
      const session = await LanguageModel.create(request.options || {});

      try {
        // Generate answer
        const answer = await session.prompt(request.prompt);

        if (!answer || typeof answer !== 'string') {
          throw new Error('Invalid response from Prompt API');
        }

        const processingTime = Date.now() - startTime;

        console.log(`[Rewind. Offscreen] Prompt request ${request.id} completed in ${processingTime}ms`);

        return {
          id: request.id,
          success: true,
          answer,
          processingTime
        };

      } finally {
        try {
          await session.destroy();
          console.log(`[Rewind. Offscreen] Session for request ${request.id} destroyed`);
        } catch (error) {
          console.warn(`[Rewind. Offscreen] Error destroying session:`, error);
        }
      }

    } catch (error) {
      const processingTime = Date.now() - startTime;
      console.error(`[Rewind. Offscreen] Prompt request ${request.id} failed:`, error);

      return {
        id: request.id,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        processingTime
      };
    }
  }

  /**
   * Process a prompt request with streaming
   */
  public async processPromptRequestStreaming(request: PromptRequest): Promise<void> {
    try {
      console.log(`[Rewind. Offscreen] Processing streaming prompt request ${request.id}`);

      if (!this.promptApiAvailable) {
        throw new Error('Chrome Prompt API not available');
      }

      // Create language model session
      const session = await LanguageModel.create(request.options || {});

      try {
        // Stream answer
        const stream = session.promptStreaming(request.prompt);

        for await (const chunk of stream) {
          // Send chunk back to service worker
          chrome.runtime.sendMessage({
            type: 'PROMPT_STREAM_CHUNK',
            requestId: request.id,
            chunk
          }).catch(error => {
            console.error('[Rewind. Offscreen] Failed to send chunk:', error);
          });
        }

        // Send completion signal
        chrome.runtime.sendMessage({
          type: 'PROMPT_STREAM_COMPLETE',
          requestId: request.id
        }).catch(error => {
          console.error('[Rewind. Offscreen] Failed to send completion:', error);
        });

        console.log(`[Rewind. Offscreen] Streaming prompt request ${request.id} completed`);

      } finally {
        try {
          await session.destroy();
          console.log(`[Rewind. Offscreen] Session for request ${request.id} destroyed`);
        } catch (error) {
          console.warn(`[Rewind. Offscreen] Error destroying session:`, error);
        }
      }

    } catch (error) {
      console.error(`[Rewind. Offscreen] Streaming prompt request ${request.id} failed:`, error);

      // Send error signal
      chrome.runtime.sendMessage({
        type: 'PROMPT_STREAM_ERROR',
        requestId: request.id,
        error: error instanceof Error ? error.message : 'Unknown error'
      }).catch(err => {
        console.error('[Rewind. Offscreen] Failed to send error:', err);
      });
    }
  }
}

// Create and initialize the prompt handler
const promptHandler = new OffscreenPromptHandler();

// Handle messages from service worker
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  console.log('[Rewind. Offscreen] Received message:', message.type);

  if (message.type === 'PROMPT_API_STATUS') {
    const available = promptHandler.isAvailable();
    sendResponse({ available });
    return true;
  }

  if (message.type === 'PROMPT_REQUEST') {
    // Handle prompt request asynchronously
    const request: PromptRequest = message.request;
    promptHandler.processPromptRequest(request).then(response => {
      chrome.runtime.sendMessage({
        type: 'PROMPT_RESPONSE',
        response
      }).catch(error => {
        console.error('[Rewind. Offscreen] Failed to send prompt response:', error);
      });
    });

    sendResponse({ success: true, message: 'Prompt request received' });
    return true;
  }

  if (message.type === 'PROMPT_STREAMING_REQUEST') {
    // Handle streaming prompt request asynchronously
    const request: PromptRequest = message.request;
    promptHandler.processPromptRequestStreaming(request);

    sendResponse({ success: true, message: 'Streaming request received' });
    return true;
  }

  return false;
});

// Initialize when ready
promptHandler.initialize();

console.log('[Rewind. Offscreen] Prompt API handler initialized');