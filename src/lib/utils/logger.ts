/**
 * Conditional logging utility
 */

import { ENV_CONFIG } from '../config/searchConfig';

/**
 * Logger class with environment-aware logging
 */
export class Logger {
  private context: string;

  constructor(context: string) {
    this.context = context;
  }

  /**
   * Log debug message (only in development)
   */
  debug(message: string, ...args: any[]): void {
    if (ENV_CONFIG.VERBOSE_LOGGING) {
      console.log(`[${this.context}] ${message}`, ...args);
    }
  }

  /**
   * Log info message (only in development)
   */
  info(message: string, ...args: any[]): void {
    if (ENV_CONFIG.VERBOSE_LOGGING) {
      console.log(`[${this.context}] ${message}`, ...args);
    }
  }

  /**
   * Log warning (always logged - important for troubleshooting)
   */
  warn(message: string, ...args: any[]): void {
    console.warn(`[${this.context}] ${message}`, ...args);
  }

  /**
   * Log error (always logged - critical for debugging)
   */
  error(message: string, ...args: any[]): void {
    console.error(`[${this.context}] ${message}`, ...args);
  }

  /**
   * Log performance timing (only in development or when metrics are enabled)
   */
  time(label: string): void {
    if (ENV_CONFIG.VERBOSE_LOGGING || ENV_CONFIG.TRACK_METRICS) {
      console.time(`[${this.context}] ${label}`);
    }
  }

  /**
   * End performance timing
   */
  timeEnd(label: string): void {
    if (ENV_CONFIG.VERBOSE_LOGGING || ENV_CONFIG.TRACK_METRICS) {
      console.timeEnd(`[${this.context}] ${label}`);
    }
  }

  /**
   * Log with timing
   */
  timed<T>(label: string, fn: () => T): T {
    this.time(label);
    try {
      const result = fn();
      this.timeEnd(label);
      return result;
    } catch (error) {
      this.timeEnd(label);
      this.error(`${label} failed:`, error);
      throw error;
    }
  }

  /**
   * Log async with timing
   */
  async timedAsync<T>(label: string, fn: () => Promise<T>): Promise<T> {
    this.time(label);
    try {
      const result = await fn();
      this.timeEnd(label);
      return result;
    } catch (error) {
      this.timeEnd(label);
      this.error(`${label} failed:`, error);
      throw error;
    }
  }
}

/**
 * Create a logger instance with the given context
 */
export function createLogger(context: string): Logger {
  return new Logger(context);
}

/**
 * Default logger instances for common contexts
 */
export const loggers = {
  vectorSearch: createLogger('VectorSearch'),
  keywordSearch: createLogger('KeywordSearch'),
  hybridSearch: createLogger('HybridSearch'),
  vectorStore: createLogger('VectorStore'),
  embeddingService: createLogger('EmbeddingService'),
  indexingPipeline: createLogger('IndexingPipeline'),
  contentExtractor: createLogger('ContentExtractor'),
  documentChunker: createLogger('DocumentChunker'),
  background: createLogger('Background'),
  promptService: createLogger('PromptService'),
  ragController: createLogger('RAGController'),
  tabMonitor: createLogger('TabMonitor'),
  indexingQueue: createLogger('IndexingQueue'),
  offscreenManager: createLogger('OffscreenManager'),
  summarizerService: createLogger('SummarizerService'),
  sidebar: createLogger('Rewind. Sidebar'),
  popup: createLogger('Rewind. Popup'),
  contentScript: createLogger('ContentScript'),
  offscreenSummarizer: createLogger('OffscreenSummarizer'),
} as const;