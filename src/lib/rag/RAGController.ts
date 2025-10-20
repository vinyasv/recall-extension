/**
 * RAGController - Orchestrates Retrieval-Augmented Generation
 * Combines PassageRetriever with PromptService to answer questions from browsing history
 */

import { passageRetriever } from './PassageRetriever';
import { promptService } from '../prompt/PromptService';
import type { SearchResult } from '../search/types';
import type { PromptOptions } from '../prompt/PromptService';
import type { RetrievedPassage } from './types';
import { loggers } from '../utils/logger';

export interface RAGOptions {
  topK?: number; // Number of search results to retrieve (default: 5)
  minSimilarity?: number; // Minimum similarity threshold (default: 0.3)
  maxContextLength?: number; // Maximum context length in chars (default: 4000)
  maxPassagesPerPage?: number; // Max passages per page (default: 2)
  maxPagesPerDomain?: number; // Max pages per domain (default: 3)
  qualityWeight?: number; // Weight for passage quality (default: 0.3)
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
    maxContextLength: 4000,
    maxPassagesPerPage: 2,
    maxPagesPerDomain: 3,
    qualityWeight: 0.3,
  };

  /**
   * Initialize the RAG controller
   */
  async initialize(): Promise<void> {
    loggers.ragController.debug('RAG controller initialized (no intent classification)');
  }

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

    // Step 1: Retrieve relevant passages
    const searchStartTime = Date.now();
    const passages = await passageRetriever.retrieve(question, {
      topK: opts.topK,
      minSimilarity: opts.minSimilarity,
      maxPassagesPerPage: opts.maxPassagesPerPage,
      maxPagesPerDomain: opts.maxPagesPerDomain,
      qualityWeight: opts.qualityWeight,
    });

    const searchTime = Date.now() - searchStartTime;

    loggers.ragController.debug(
      `Retrieved ${passages.length} passages in ${searchTime}ms`
    );

    if (passages.length === 0) {
      return {
        answer: "I couldn't find any relevant information in your browsing history to answer this question.",
        sources: [],
        processingTime: Date.now() - startTime,
        searchTime,
        generationTime: 0,
      };
    }

    // Step 2: Build context from passages
    const context = this._buildContextFromPassages(passages, opts.maxContextLength);

    loggers.ragController.debug(`Built context with ${context.length} characters`);

    // Step 3: Generate answer using Prompt API
    const generationStartTime = Date.now();

    try {
      const response = await promptService.generateAnswer(question, context, opts.promptOptions);
      const generationTime = Date.now() - generationStartTime;
      const totalTime = Date.now() - startTime;

      loggers.ragController.debug(`Answer generated in ${totalTime}ms total`);

      // Convert passages to SearchResult format for compatibility
      const sources = this._passagesToSearchResults(passages);

      return {
        answer: response.answer,
        sources,
        processingTime: totalTime,
        searchTime,
        generationTime,
      };
    } catch (error) {
      loggers.ragController.error('Failed to generate answer with Prompt API:', error);

      // Fallback: Return context directly if generation fails
      const generationTime = Date.now() - generationStartTime;
      const totalTime = Date.now() - startTime;

      const fallbackAnswer = `Based on your browsing history, here's what I found:\n\n${context.substring(0, 1000)}${context.length > 1000 ? '...\n\n[Note: Full context available in sources]' : ''}`;

      const sources = this._passagesToSearchResults(passages);

      return {
        answer: fallbackAnswer,
        sources,
        processingTime: totalTime,
        searchTime,
        generationTime,
      };
    }
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

    // Step 1: Retrieve relevant passages
    const searchStartTime = Date.now();
    const passages = await passageRetriever.retrieve(question, {
      topK: opts.topK,
      minSimilarity: opts.minSimilarity,
      maxPassagesPerPage: opts.maxPassagesPerPage,
      maxPagesPerDomain: opts.maxPagesPerDomain,
      qualityWeight: opts.qualityWeight,
    });

    const searchTime = Date.now() - searchStartTime;

    if (passages.length === 0) {
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
    const context = this._buildContextFromPassages(passages, opts.maxContextLength);

    // Step 3: Stream answer generation
    const generationStartTime = Date.now();
    const stream = promptService.generateAnswerStreaming(question, context, opts.promptOptions);

    for await (const chunk of stream) {
      yield { type: 'chunk', content: chunk };
    }

    const generationTime = Date.now() - generationStartTime;

    // Convert passages to SearchResult format
    const sources = this._passagesToSearchResults(passages);

    // Final metadata
    yield {
      type: 'complete',
      sources,
      timings: {
        searchTime,
        generationTime,
        totalTime: Date.now() - startTime,
      },
    };
  }

  /**
   * Format milliseconds into human-readable time ago string
   */
  private formatTimeAgo(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days} day${days > 1 ? 's' : ''} ago`;
    if (hours > 0) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
    if (minutes > 0) return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
    return 'just now';
  }

  /**
   * Build context from passages with quality indicators
   */
  private _buildContextFromPassages(
    passages: RetrievedPassage[],
    maxLength: number
  ): string {
    let context = '';
    let currentLength = 0;

    // Group passages by source page
    const groupedPassages = passageRetriever.groupByPage(passages);
    const sources = Array.from(groupedPassages.entries());

    for (let i = 0; i < sources.length; i++) {
      const [_pageId, pagePassages] = sources[i];
      const firstPassage = pagePassages[0];

      // Format: [Source N] Title
      const sourceHeader = `[Source ${i + 1}] ${firstPassage.pageTitle}\n`;
      const sourceUrl = `URL: ${firstPassage.pageUrl}\n`;

      // Add temporal metadata for LLM reasoning about recency and frequency
      const now = Date.now();
      const visitedAgo = this.formatTimeAgo(now - firstPassage.timestamp);
      const visitInfo = firstPassage.visitCount > 1
        ? ` | Visited ${firstPassage.visitCount} times`
        : '';
      const lastAccessedInfo = firstPassage.lastAccessed
        ? ` | Last accessed: ${this.formatTimeAgo(now - firstPassage.lastAccessed)}`
        : '';
      const dwellInfo = firstPassage.dwellTime > 60
        ? ` | Time on page: ${Math.round(firstPassage.dwellTime / 60)} min`
        : '';

      const metadata = `Visited: ${visitedAgo}${visitInfo}${lastAccessedInfo}${dwellInfo}\n`;

      // Combine passages from this page
      const passageTexts = pagePassages
        .map((p) => p.passage.text.trim())
        .join('\n\n');

      const sourceContent = passageTexts + '\n\n';

      const fullSource = sourceHeader + sourceUrl + metadata + sourceContent;

      // Check if adding this source would exceed max length
      if (currentLength + fullSource.length > maxLength) {
        // Try to fit at least the header, URL, and metadata with one truncated passage
        const headerSize = sourceHeader.length + sourceUrl.length + metadata.length;
        const remainingSpace = maxLength - currentLength - headerSize;
        if (remainingSpace > 200) {
          const truncatedContent = sourceContent.substring(0, remainingSpace - 20) + '...\n\n';
          context += sourceHeader + sourceUrl + metadata + truncatedContent;
        }
        break;
      }

      context += fullSource;
      currentLength += fullSource.length;
    }

    return context;
  }

  /**
   * Convert passages to SearchResult format for compatibility
   */
  private _passagesToSearchResults(passages: RetrievedPassage[]): SearchResult[] {
    // Get unique sources
    const sources = passageRetriever.getUniqueSources(passages);

    // Convert to SearchResult format
    return sources.map((source) => ({
      page: {
        id: source.pageId,
        url: source.pageUrl,
        title: source.pageTitle,
        content: '', // We don't need full content
        summary: '', // We don't need summary
        passages: [], // Passages already used in context
        titleEmbedding: new Float32Array(), // Not needed for RAG context
        urlEmbedding: new Float32Array(), // Not needed for RAG context
        embedding: new Float32Array(), // Not needed
        timestamp: Date.now(),
        dwellTime: 0,
        lastAccessed: 0,
        visitCount: 1, // Default value (actual count not needed for RAG context)
      },
      similarity: 0, // Not meaningful at page level
      relevanceScore: 0, // Not meaningful at page level
    }));
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
