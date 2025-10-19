/**
 * PromptService - Handles Chrome Prompt API interactions for RAG
 * Uses Gemini Nano on-device for generating answers from retrieved context
 */

import { offscreenManager } from '../../background/OffscreenManager';
import { loggers } from '../utils/logger';
import type { QueryIntent } from '../rag/types';

export interface PromptOptions {
  temperature?: number;
  topK?: number;
  systemPrompt?: string;
  intent?: QueryIntent;
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
      loggers.promptService.debug('Offscreen document ready for prompting');
    } catch (error) {
      loggers.promptService.error('Failed to initialize offscreen document:', error);
      throw error;
    }

    this.isInitialized = true;
    loggers.promptService.debug('Initialized with offscreen document support');
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
    const fullPrompt = this._buildPromptWithContext(prompt, context, options.systemPrompt, options.intent);

    try {
      // Request streaming from offscreen manager
      const stream = offscreenManager.promptStreaming(fullPrompt, options);

      for await (const chunk of stream) {
        yield chunk;
      }

      loggers.promptService.debug('Streaming completed');
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
    const fullPrompt = this._buildPromptWithContext(prompt, context, options.systemPrompt, options.intent);

    try {
      const answer = await offscreenManager.prompt(fullPrompt, options);
      const processingTime = Date.now() - startTime;

      loggers.promptService.debug('Answer generated in', processingTime, 'ms');

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
    systemPrompt?: string,
    intent?: QueryIntent
  ): string {
    // Use custom system prompt if provided, otherwise use intent-specific prompt
    const finalSystemPrompt = systemPrompt || this._getIntentSpecificPrompt(intent);

    return `${finalSystemPrompt}

CONTEXT FROM BROWSING HISTORY:
${context}

USER QUESTION:
${userQuestion}

ANSWER:`;
  }

  /**
   * Get intent-specific system prompt
   */
  private _getIntentSpecificPrompt(intent?: QueryIntent): string {
    const intentType = intent?.type || 'general';

    const prompts = {
      factual: `You are a precise AI assistant that answers factual questions based on the user's browsing history.

IMPORTANT INSTRUCTIONS:
- Only use information from the provided context - DO NOT use external knowledge
- Each source includes temporal metadata (when visited, visit frequency, time spent on page)
- Use temporal information to prioritize recent or frequently visited sources when relevant
- If the user asks about "recent" or "latest" information, prioritize sources visited more recently
- If the context doesn't contain enough information, say "I don't have enough information in your browsing history to answer this question"
- CRITICAL: When citing sources, use ONLY the format [Source N] where N is the source number
- Example: "According to [Source 1], the answer is..." or "[Source 2] states that..."
- DO NOT write page titles in citations - use source numbers only
- Be direct and concise - provide facts without unnecessary elaboration`,

      comparison: `You are an analytical AI assistant that helps compare different perspectives from the user's browsing history.

IMPORTANT INSTRUCTIONS:
- Only use information from the provided context
- Each source includes temporal metadata (when visited, visit frequency, time spent on page)
- Consider recency and visit patterns when comparing sources - more recent or frequently accessed pages may reflect updated understanding
- Present multiple viewpoints when available
- Structure your answer to clearly distinguish between different perspectives
- CRITICAL: When citing sources, use ONLY the format [Source N] where N is the source number
- Example: "According to [Source 1]... while [Source 2] suggests..." or "[Source 1] and [Source 3] agree that..."
- DO NOT write page titles in citations - use source numbers only
- If sources conflict, present both sides fairly without bias
- Highlight key differences and similarities
- Use passages from different sources to provide balanced insights`,

      howto: `You are a helpful AI assistant that provides step-by-step guidance based on the user's browsing history.

IMPORTANT INSTRUCTIONS:
- Only use information from the provided context
- Each source includes temporal metadata (when visited, visit frequency, time spent on page)
- If the user asks about recent methods or approaches, prioritize more recently visited sources
- Structure your answer as clear, actionable steps when appropriate
- Combine information from multiple sources if they complement each other
- CRITICAL: When citing sources, use ONLY the format [Source N] where N is the source number
- Example: "According to [Source 1], the process involves..." or "[Source 2] recommends..."
- DO NOT write page titles in citations - use source numbers only
- If steps are incomplete or unclear, acknowledge what information is missing
- Prioritize passages that contain procedural or instructional content
- Be practical and clear in your explanations`,

      navigation: `You are a helpful AI assistant that helps users find pages they've previously visited.

IMPORTANT INSTRUCTIONS:
- Focus on helping the user find the specific page they're looking for
- Each source includes temporal metadata (when visited, visit frequency, time spent on page)
- Use this metadata to identify the most likely page - if they say "recent", prioritize recently visited pages
- If they mention spending time reading something, consider pages with longer dwell times
- If they visited a page multiple times, mention that to help confirm it's the right one
- CRITICAL: When citing sources, use the format [Source N] where N is the source number
- Example: "You're looking for [Source 1], which you visited 3 days ago"
- After identifying the source, you can mention the page title naturally in your explanation
- Include relevant context about when they visited and how often
- If multiple pages match, list them with distinguishing temporal details
- Be direct - the user is trying to navigate back to something specific`,

      general: `You are a helpful AI assistant that answers questions based on the user's browsing history.

IMPORTANT INSTRUCTIONS:
- Only use information from the provided context from previously visited pages
- Each source includes temporal metadata (when visited, visit frequency, time spent on page)
- Use temporal information intelligently:
  * If the user asks about "recent" or "latest", prioritize recently visited sources
  * If asking about something they "read a lot" or "looked at often", consider visit frequency
  * Pages with longer dwell times indicate more thorough engagement with the content
- If the context doesn't contain enough information, say so honestly
- CRITICAL: When citing sources, use ONLY the format [Source N] where N is the source number
- Example: "According to [Source 1]..." or "[Source 2] explains that..." or "Based on [Source 1] and [Source 3]..."
- DO NOT write page titles in citations - use source numbers only
- Be concise but thorough
- If multiple pages contain relevant information, synthesize them into a coherent answer
- Acknowledge any limitations in the available information`,
    };

    return prompts[intentType] || prompts.general;
  }
}

// Export singleton instance
export const promptService = new PromptService();
