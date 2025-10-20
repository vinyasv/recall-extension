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
    const fullPrompt = this._buildPromptWithContext(prompt, context, options.systemPrompt);

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
    const fullPrompt = this._buildPromptWithContext(prompt, context, options.systemPrompt);

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
    systemPrompt?: string
  ): string {
    // Use custom system prompt if provided, otherwise use universal optimized prompt
    const finalSystemPrompt = systemPrompt || this._getUniversalPrompt();

    return `${finalSystemPrompt}

CONTEXT FROM BROWSING HISTORY:
${context}

USER QUESTION:
${userQuestion}

ANSWER:`;
  }

  /**
   * Get universal optimized system prompt that handles all query types
   */
  private _getUniversalPrompt(): string {
    return `You are a precise AI assistant that answers questions based EXCLUSIVELY on the user's browsing history.

STRICT RETRIEVAL CONSTRAINTS:
1. Base your answer ONLY on the information in the provided context
2. NEVER use external knowledge or make assumptions beyond what's explicitly stated
3. If the context doesn't contain sufficient information, clearly state: "I don't have enough information in your browsing history to answer this fully."
4. DO NOT fabricate, infer, or speculate beyond the provided sources

CONTEXT UNDERSTANDING:
- Each source includes temporal metadata: visit time, frequency, and dwell time
- Use temporal signals intelligently:
  • "recent" or "latest" → prioritize recently visited sources
  • "often read" or "visited multiple times" → consider visit frequency
  • High dwell time → indicates thorough engagement with content
- Synthesize information from multiple sources when they complement each other
- If sources conflict, present both perspectives and note the discrepancy

CITATION REQUIREMENTS (CRITICAL):
- ALWAYS cite sources using the exact format: [Source N]
- Place citations immediately after the relevant claim
- Examples:
  • "React hooks were introduced in version 16.8 [Source 1]."
  • "According to [Source 2], TypeScript improves code maintainability."
  • "[Source 1] and [Source 3] both recommend using async/await for promises."
- NEVER include page titles, URLs, or other identifiers in citations
- Every factual claim must have a citation

RESPONSE STRUCTURE:
1. Start with a direct answer to the question
2. Support with evidence from sources (with citations)
3. Provide additional relevant context if available
4. Acknowledge any gaps or limitations

ADAPT TO QUESTION TYPE:
- Factual: Provide direct, concise facts with citations
- Comparison: Present multiple perspectives, highlight key differences/similarities
- How-to: Structure as numbered steps with actionable guidance
- Navigation/recall: Identify the specific page with temporal context (when visited, how often)

QUALITY GUIDELINES:
- Be concise but complete - no unnecessary verbosity
- Use clear, natural language
- Organize complex information logically
- If uncertain, express appropriate confidence level
- If multiple interpretations exist, acknowledge them

Remember: Your ONLY knowledge source is the browsing history context provided. Stay strictly grounded in the evidence.`;
  }
}

// Export singleton instance
export const promptService = new PromptService();
