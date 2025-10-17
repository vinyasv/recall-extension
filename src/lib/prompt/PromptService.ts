/**
 * PromptService - Handles Chrome Prompt API interactions for RAG
 * Uses Gemini Nano on-device for generating answers from retrieved context
 */

import { offscreenManager } from '../../background/OffscreenManager';
import { loggers } from '../utils/logger';

export interface PromptOptions {
  temperature?: number;
  topK?: number;
  systemPrompt?: string;
}

export interface PromptResponse {
  answer: string;
  tokensUsed?: number;
  processingTime: number;
}

/**
 * Prompt service class for RAG generation
 */
export class PromptService {
  private isInitialized: boolean = false;

  /**
   * Initialize the prompt service
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    loggers.promptService.debug('Initializing with offscreen document support...');

    try {
      await offscreenManager.ensureOffscreenOpen();
      loggers.promptService.debug('✅ Offscreen document ready for prompting');
    } catch (error) {
      loggers.promptService.error('Failed to initialize offscreen document:', error);
      throw error;
    }

    this.isInitialized = true;
    loggers.promptService.debug('✅ Initialized with offscreen document support');
  }

  /**
   * Check if Prompt API is available
   */
  async isAvailable(): Promise<boolean> {
    try {
      if (!this.isInitialized) {
        await this.initialize();
      }

      const status = await offscreenManager.checkPromptApiAvailability();
      return status.available;
    } catch (error) {
      loggers.promptService.error('Failed to check availability:', error);
      return false;
    }
  }

  /**
   * Generate an answer using the Prompt API with streaming
   * @param prompt The user's question
   * @param context Retrieved context from search results
   * @param options Prompt options
   * @returns Stream of text chunks
   */
  async *generateAnswerStreaming(
    prompt: string,
    context: string,
    options: PromptOptions = {}
  ): AsyncGenerator<string, void, unknown> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    loggers.promptService.debug('Generating streaming answer...');

    // Build the full prompt with context
    const fullPrompt = this._buildPromptWithContext(prompt, context, options.systemPrompt);

    try {
      // Request streaming from offscreen manager
      const stream = offscreenManager.promptStreaming(fullPrompt, options);

      for await (const chunk of stream) {
        yield chunk;
      }

      loggers.promptService.debug('✅ Streaming completed');
    } catch (error) {
      loggers.promptService.error('Streaming failed:', error);
      throw error;
    }
  }

  /**
   * Generate an answer using the Prompt API (non-streaming)
   * @param prompt The user's question
   * @param context Retrieved context from search results
   * @param options Prompt options
   * @returns Complete answer
   */
  async generateAnswer(
    prompt: string,
    context: string,
    options: PromptOptions = {}
  ): Promise<PromptResponse> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    const startTime = Date.now();

    loggers.promptService.debug('Generating answer...');

    // Build the full prompt with context
    const fullPrompt = this._buildPromptWithContext(prompt, context, options.systemPrompt);

    try {
      const answer = await offscreenManager.prompt(fullPrompt, options);
      const processingTime = Date.now() - startTime;

      loggers.promptService.debug('✅ Answer generated in', processingTime, 'ms');

      return {
        answer,
        processingTime,
      };
    } catch (error) {
      loggers.promptService.error('Generation failed:', error);
      throw error;
    }
  }

  /**
   * Build a prompt with retrieved context for RAG
   */
  private _buildPromptWithContext(
    userQuestion: string,
    context: string,
    systemPrompt?: string
  ): string {
    const defaultSystemPrompt = `You are a helpful AI assistant that answers questions based on the user's browsing history. Use the provided context from their previously visited web pages to answer their questions accurately and concisely.

IMPORTANT INSTRUCTIONS:
- Only use information from the provided context
- If the context doesn't contain enough information to answer the question, say so honestly
- Cite the source pages when relevant by mentioning the page title or domain
- Be concise but thorough
- If multiple pages contain relevant information, synthesize them into a coherent answer`;

    const finalSystemPrompt = systemPrompt || defaultSystemPrompt;

    return `${finalSystemPrompt}

CONTEXT FROM BROWSING HISTORY:
${context}

USER QUESTION:
${userQuestion}

ANSWER:`;
  }
}

// Export singleton instance
export const promptService = new PromptService();
