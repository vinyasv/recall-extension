/**
 * SummarizerService - Generates summaries using Chrome Summarizer API via offscreen document
 * This approach bypasses user activation requirements by maintaining activation state
 */

import { offscreenManager } from '../../background/OffscreenManager';
import { loggers } from '../utils/logger';

/**
 * Summarizer service class
 */
export class SummarizerService {
  private isInitialized: boolean = false;

  /**
   * Initialize the summarizer service
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    loggers.summarizerService.debug('Initializing with offscreen document support...');

    // Ensure offscreen document is ready for AI processing
    try {
      await offscreenManager.ensureOffscreenOpen();
      loggers.summarizerService.debug('✅ Offscreen document ready for summarization');
    } catch (error) {
      loggers.summarizerService.warn('Failed to initialize offscreen document:', error);
      // We'll continue anyway and handle errors during summarization
    }

    this.isInitialized = true;
    loggers.summarizerService.debug('✅ Initialized with offscreen document support');
  }

  /**
   * Check AI API availability via offscreen document
   */
  private async _checkAIAvailabilityViaOffscreen(): Promise<boolean> {
    try {
      loggers.summarizerService.debug('Checking AI API availability via offscreen document...');

      const status = await offscreenManager.getStatus();
      loggers.summarizerService.debug('Offscreen status:', status);

      return status.available;
    } catch (error) {
      loggers.summarizerService.warn('Failed to check AI availability:', error);
      return false;
    }
  }

  /**
   * Generate a search-optimized summary with context
   * CRITICAL: Chrome Summarizer API is REQUIRED - will throw error if unavailable
   * @param text Text to summarize
   * @param url Page URL (for domain extraction)
   * @param title Page title (for context building)
   * @param maxLength Maximum summary length (default: 800 chars)
   * @returns Search-optimized summary
   * @throws Error if Chrome Summarizer API is not available or fails
   */
  async summarizeForSearch(text: string, url: string, title: string, maxLength: number = 800): Promise<string> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    // Input validation
    if (!text || text.trim().length === 0) {
      throw new Error('Cannot summarize empty text');
    }

    const trimmedText = text.trim();

    // If text is already short, just return it
    if (trimmedText.length <= maxLength) {
      return trimmedText;
    }

    // Pre-truncate if needed
    const maxInputLength = 50000;
    const inputText = trimmedText.length > maxInputLength
      ? this._truncateIntelligently(trimmedText, maxInputLength)
      : trimmedText;

    // Chrome Summarizer API via offscreen document (REQUIRED - no fallback)
    loggers.summarizerService.debug('Attempting Chrome Summarizer API via offscreen document (REQUIRED)...');
    const summary = await offscreenManager.summarizeText(inputText, url, title, maxLength);

    if (!summary || summary.length === 0) {
      throw new Error('Chrome Summarizer API returned empty summary. Ensure Chrome 138+ with Gemini Nano is installed.');
    }

    loggers.summarizerService.debug('✅ Chrome Summarizer API successful via offscreen document');
    return summary;
  }

  /**
   * Generate a summary from text
   * CRITICAL: Chrome Summarizer API is REQUIRED - will throw error if unavailable
   * @param text Text to summarize
   * @param maxLength Maximum summary length (default: 500 chars)
   * @returns Summary text
   * @throws Error if Chrome Summarizer API is not available or fails
   */
  async summarize(text: string, maxLength: number = 500): Promise<string> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    // Input validation
    if (!text || text.trim().length === 0) {
      throw new Error('Cannot summarize empty text');
    }

    const trimmedText = text.trim();

    // If text is already short, just return it
    if (trimmedText.length <= maxLength) {
      return trimmedText;
    }

    // Chrome AI has input limits (typically ~10k-100k chars depending on model)
    // If text is too long, pre-truncate intelligently
    const maxInputLength = 50000; // Conservative limit
    const inputText = trimmedText.length > maxInputLength
      ? this._truncateIntelligently(trimmedText, maxInputLength)
      : trimmedText;

    // Chrome Summarizer API via offscreen document (REQUIRED - no fallback)
    loggers.summarizerService.debug('Attempting Chrome Summarizer API via offscreen document (REQUIRED)...');
    const summary = await offscreenManager.summarizeText(inputText, '', '', maxLength);

    if (!summary || summary.length === 0) {
      throw new Error('Chrome Summarizer API returned empty summary. Ensure Chrome 138+ with Gemini Nano is installed.');
    }

    loggers.summarizerService.debug('✅ Chrome Summarizer API successful via offscreen document');
    return summary;
  }


  /**
   * Check if Chrome Summarizer API is available
   */
  async isAIApiAvailable(): Promise<boolean> {
    return await this._checkAIAvailabilityViaOffscreen();
  }

  /**
   * Intelligently truncate text to fit within limits
   * Tries to break at paragraph or sentence boundaries
   */
  private _truncateIntelligently(text: string, maxLength: number): string {
    if (text.length <= maxLength) {
      return text;
    }

    const truncated = text.substring(0, maxLength);

    // Try to break at paragraph boundary
    const lastParagraph = truncated.lastIndexOf('\n\n');
    if (lastParagraph > maxLength * 0.7) {
      return truncated.substring(0, lastParagraph).trim();
    }

    // Try to break at sentence boundary
    const lastPeriod = truncated.lastIndexOf('.');
    const lastQuestion = truncated.lastIndexOf('?');
    const lastExclamation = truncated.lastIndexOf('!');
    const lastSentence = Math.max(lastPeriod, lastQuestion, lastExclamation);

    if (lastSentence > maxLength * 0.7) {
      return truncated.substring(0, lastSentence + 1).trim();
    }

    // Fall back to word boundary
    const lastSpace = truncated.lastIndexOf(' ');
    if (lastSpace > maxLength * 0.8) {
      return truncated.substring(0, lastSpace).trim() + '...';
    }

    // Last resort: hard truncate
    return truncated.trim() + '...';
  }
}

// Export singleton instance
export const summarizerService = new SummarizerService();