/**
 * RAGController - Orchestrates Retrieval-Augmented Generation
 * Combines HybridSearch with PromptService to answer questions from browsing history
 */

import { hybridSearch } from '../search/HybridSearch';
import { promptService } from '../prompt/PromptService';
import type { SearchResult } from '../search/types';
import type { PromptOptions } from '../prompt/PromptService';
import { loggers } from '../utils/logger';

export interface RAGOptions {
  topK?: number; // Number of search results to retrieve (default: 5)
  minSimilarity?: number; // Minimum similarity threshold (default: 0.3)
  maxContextLength?: number; // Maximum context length in chars (default: 8000)
  promptOptions?: PromptOptions;
}

export interface RAGResult {
  answer: string;
  sources: SearchResult[];
  processingTime: number;
  searchTime: number;
  generationTime: number;
}

/**
 * RAG Controller class
 */
export class RAGController {
  private readonly DEFAULT_OPTIONS: Required<Omit<RAGOptions, 'promptOptions'>> = {
    topK: 5,
    minSimilarity: 0.3,
    maxContextLength: 8000,
  };

  /**
   * Answer a question using RAG (Retrieval-Augmented Generation)
   * @param question User's question
   * @param options RAG options
   * @returns RAG result with answer and sources
   */
  async answerQuestion(question: string, options: RAGOptions = {}): Promise<RAGResult> {
    const startTime = Date.now();
    const opts = { ...this.DEFAULT_OPTIONS, ...options };

    loggers.ragController.debug('Answering question:', question);

    // Step 1: Retrieve relevant documents using hybrid search
    const searchStartTime = Date.now();
    const searchResults = await hybridSearch.search(question, {
      k: opts.topK,
      mode: 'hybrid',
    });

    // Filter by minimum similarity
    const relevantResults = searchResults.filter(
      (result) => result.similarity >= opts.minSimilarity
    );

    const searchTime = Date.now() - searchStartTime;

    loggers.ragController.debug(
      `Found ${relevantResults.length} relevant results in ${searchTime}ms`
    );

    if (relevantResults.length === 0) {
      return {
        answer: "I couldn't find any relevant information in your browsing history to answer this question.",
        sources: [],
        processingTime: Date.now() - startTime,
        searchTime,
        generationTime: 0,
      };
    }

    // Step 2: Build context from search results
    const context = this._buildContext(relevantResults, opts.maxContextLength);

    loggers.ragController.debug(`Built context with ${context.length} characters`);

    // Step 3: Generate answer using Prompt API
    const generationStartTime = Date.now();
    const response = await promptService.generateAnswer(question, context, opts.promptOptions);
    const generationTime = Date.now() - generationStartTime;

    const totalTime = Date.now() - startTime;

    loggers.ragController.debug(`✅ Answer generated in ${totalTime}ms total`);

    return {
      answer: response.answer,
      sources: relevantResults,
      processingTime: totalTime,
      searchTime,
      generationTime,
    };
  }

  /**
   * Answer a question with streaming response
   * @param question User's question
   * @param options RAG options
   * @returns Async generator yielding answer chunks and final metadata
   */
  async *answerQuestionStreaming(
    question: string,
    options: RAGOptions = {}
  ): AsyncGenerator<
    { type: 'chunk'; content: string } | { type: 'complete'; sources: SearchResult[]; timings: any },
    void,
    unknown
  > {
    const startTime = Date.now();
    const opts = { ...this.DEFAULT_OPTIONS, ...options };

    loggers.ragController.debug('Answering question (streaming):', question);

    // Step 1: Retrieve relevant documents
    const searchStartTime = Date.now();
    const searchResults = await hybridSearch.search(question, {
      k: opts.topK,
      mode: 'hybrid',
    });

    const relevantResults = searchResults.filter(
      (result) => result.similarity >= opts.minSimilarity
    );

    const searchTime = Date.now() - searchStartTime;

    if (relevantResults.length === 0) {
      yield {
        type: 'chunk',
        content: "I couldn't find any relevant information in your browsing history to answer this question.",
      };
      yield {
        type: 'complete',
        sources: [],
        timings: { searchTime, generationTime: 0, totalTime: Date.now() - startTime },
      };
      return;
    }

    // Step 2: Build context
    const context = this._buildContext(relevantResults, opts.maxContextLength);

    // Step 3: Stream answer generation
    const generationStartTime = Date.now();
    const stream = promptService.generateAnswerStreaming(question, context, opts.promptOptions);

    for await (const chunk of stream) {
      yield { type: 'chunk', content: chunk };
    }

    const generationTime = Date.now() - generationStartTime;

    // Final metadata
    yield {
      type: 'complete',
      sources: relevantResults,
      timings: {
        searchTime,
        generationTime,
        totalTime: Date.now() - startTime,
      },
    };
  }

  /**
   * Build context string from search results
   * Formats results with titles, URLs, and content
   */
  private _buildContext(results: SearchResult[], maxLength: number): string {
    let context = '';
    let currentLength = 0;

    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      const page = result.page;

      // Format: [Source N] Title (domain) - summary/content
      const sourceHeader = `[Source ${i + 1}] ${page.title}\n`;
      const sourceUrl = `URL: ${page.url}\n`;
      const sourceContent = `${page.summary || page.content}\n\n`;

      const fullSource = sourceHeader + sourceUrl + sourceContent;

      // Check if adding this source would exceed max length
      if (currentLength + fullSource.length > maxLength) {
        // Try to fit a truncated version
        const remainingSpace = maxLength - currentLength - sourceHeader.length - sourceUrl.length;
        if (remainingSpace > 200) {
          const truncatedContent = (page.summary || page.content).substring(0, remainingSpace - 20) + '...\n\n';
          context += sourceHeader + sourceUrl + truncatedContent;
        }
        break;
      }

      context += fullSource;
      currentLength += fullSource.length;
    }

    return context;
  }

  /**
   * Check if RAG is available
   */
  async isAvailable(): Promise<boolean> {
    return await promptService.isAvailable();
  }
}

// Export singleton instance
export const ragController = new RAGController();
