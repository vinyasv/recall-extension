/**
 * SummarizerService - Generates summaries using Chrome Summarizer API or fallback
 */

/**
 * Summarizer API types (Chrome 138+)
 * These are experimental APIs, so we define them manually
 */
declare global {
  interface Window {
    ai?: {
      summarizer?: {
        capabilities: () => Promise<{
          available: 'readily' | 'after-download' | 'no';
        }>;
        create: (options: {
          type?: 'key-points' | 'tldr' | 'headline' | 'teaser';
          format?: 'markdown' | 'plain-text';
          length?: 'short' | 'medium' | 'long';
          sharedContext?: string;
        }) => Promise<{
          summarize: (text: string) => Promise<string>;
          destroy: () => Promise<void>;
        }>;
      };
    };
  }
}

/**
 * Summarizer service class
 */
export class SummarizerService {
  private isApiAvailable: boolean = false;
  private isInitialized: boolean = false;

  /**
   * Initialize and check API availability
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      // In service workers, window is not available - use fallback
      if (typeof window === 'undefined') {
        console.log('[SummarizerService] Running in service worker, using fallback');
        this.isApiAvailable = false;
        this.isInitialized = true;
        return;
      }

      // Check if the API exists
      if (window.ai?.summarizer) {
        const capabilities = await window.ai.summarizer.capabilities();

        if (capabilities.available === 'readily') {
          this.isApiAvailable = true;
          console.log('[SummarizerService] Chrome Summarizer API is available');
        } else if (capabilities.available === 'after-download') {
          console.log('[SummarizerService] Summarizer API available after download');
          this.isApiAvailable = true; // We'll try to use it
        } else {
          console.log('[SummarizerService] Summarizer API not available, using fallback');
          this.isApiAvailable = false;
        }
      } else {
        console.log('[SummarizerService] Chrome Summarizer API not found, using fallback');
        this.isApiAvailable = false;
      }
    } catch (error) {
      console.warn('[SummarizerService] Error checking API availability:', error);
      this.isApiAvailable = false;
    }

    this.isInitialized = true;
  }

  /**
   * Generate a search-optimized summary with context
   * @param text Text to summarize
   * @param url Page URL (for domain extraction)
   * @param title Page title (for context building)
   * @param maxLength Maximum summary length (default: 800 chars)
   * @returns Search-optimized summary
   */
  async summarizeForSearch(text: string, url: string, title: string, maxLength: number = 800): Promise<string> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    // Input validation
    if (!text || text.trim().length === 0) {
      return '';
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

    // Build context from URL and title
    const context = this._buildSearchContext(url, title);

    // Try Chrome Summarizer API first
    if (this.isApiAvailable) {
      try {
        return await this._summarizeForSearchWithAPI(inputText, context, maxLength);
      } catch (error) {
        console.warn('[SummarizerService] API summarization failed, falling back:', error);
        // Fall through to fallback method
      }
    }

    // Fallback to extractive summarization
    return this._summarizeExtractively(inputText, maxLength);
  }

  /**
   * Generate a summary from text
   * @param text Text to summarize
   * @param maxLength Maximum summary length (default: 500 chars)
   * @returns Summary text
   */
  async summarize(text: string, maxLength: number = 500): Promise<string> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    // Input validation
    if (!text || text.trim().length === 0) {
      return '';
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

    // Try Chrome Summarizer API first
    if (this.isApiAvailable) {
      try {
        return await this._summarizeWithAPI(inputText, maxLength);
      } catch (error) {
        console.warn('[SummarizerService] API summarization failed, falling back:', error);
        // Fall through to fallback method
      }
    }

    // Fallback to extractive summarization
    return this._summarizeExtractively(inputText, maxLength);
  }

  /**
   * Build search context from URL and title
   */
  private _buildSearchContext(url: string, title: string): string {
    try {
      const urlObj = new URL(url);
      const domain = urlObj.hostname.replace('www.', '');

      // Extract first part of path for topic hints
      const pathParts = urlObj.pathname.split('/').filter(p => p.length > 0);
      const topicHint = pathParts.length > 0 ? pathParts[0] : '';

      // Build context string
      let context = `Technical documentation from ${domain}`;

      if (title) {
        // Extract key terms from title (remove common words)
        const titleWords = title
          .toLowerCase()
          .replace(/[^\w\s]/g, '')
          .split(/\s+/)
          .filter(w => w.length > 3 && !['docs', 'documentation', 'tutorial', 'guide', 'reference'].includes(w));

        if (titleWords.length > 0) {
          context += ` about ${titleWords.slice(0, 3).join(', ')}`;
        }
      }

      if (topicHint && topicHint.length > 2) {
        context += `. Topic: ${topicHint}`;
      }

      return context;
    } catch (error) {
      // If URL parsing fails, just use title
      return title ? `Documentation about ${title}` : 'Technical documentation';
    }
  }

  /**
   * Summarize using Chrome Summarizer API with search optimization
   */
  private async _summarizeForSearchWithAPI(text: string, context: string, maxLength: number): Promise<string> {
    if (typeof window === 'undefined' || !window.ai?.summarizer) {
      throw new Error('Summarizer API not available');
    }

    // For search, always use 'key-points' to extract main concepts
    const summaryType = 'key-points';
    const summaryLength = 'long';

    console.log('[SummarizerService] Using sharedContext:', context);

    // Create summarizer with context
    const summarizer = await Promise.race([
      window.ai.summarizer.create({
        type: summaryType,
        format: 'plain-text',
        length: summaryLength,
        sharedContext: context,
      }),
      this._timeout(10000, 'Summarizer creation timed out'),
    ]);

    try {
      // Generate summary with timeout
      const summary = await Promise.race([
        summarizer.summarize(text),
        this._timeout(30000, 'Summarization timed out'),
      ]);

      if (!summary || typeof summary !== 'string') {
        throw new Error('Invalid summary response from API');
      }

      // Ensure it's not too long
      const trimmed = summary.length > maxLength
        ? summary.substring(0, maxLength) + '...'
        : summary;

      return trimmed;
    } finally {
      try {
        await summarizer.destroy();
      } catch (error) {
        console.warn('[SummarizerService] Error destroying summarizer:', error);
      }
    }
  }

  /**
   * Summarize using Chrome Summarizer API
   */
  private async _summarizeWithAPI(text: string, maxLength: number): Promise<string> {
    if (typeof window === 'undefined' || !window.ai?.summarizer) {
      throw new Error('Summarizer API not available');
    }

    // Determine summary type and length based on maxLength
    let summaryType: 'key-points' | 'tldr' | 'teaser' = 'tldr';
    let summaryLength: 'short' | 'medium' | 'long' = 'medium';

    if (maxLength < 300) {
      summaryType = 'teaser';
      summaryLength = 'short';
    } else if (maxLength < 600) {
      summaryType = 'tldr';
      summaryLength = 'medium';
    } else {
      summaryType = 'key-points';
      summaryLength = 'long';
    }

    // Create summarizer with timeout
    const summarizer = await Promise.race([
      window.ai.summarizer.create({
        type: summaryType,
        format: 'plain-text',
        length: summaryLength,
      }),
      this._timeout(10000, 'Summarizer creation timed out'),
    ]);

    try {
      // Generate summary with timeout (30 seconds for large texts)
      const summary = await Promise.race([
        summarizer.summarize(text),
        this._timeout(30000, 'Summarization timed out'),
      ]);

      if (!summary || typeof summary !== 'string') {
        throw new Error('Invalid summary response from API');
      }

      // Ensure it's not too long
      const trimmed = summary.length > maxLength
        ? summary.substring(0, maxLength) + '...'
        : summary;

      return trimmed;
    } finally {
      // Clean up - wrap in try/catch to avoid errors breaking the flow
      try {
        await summarizer.destroy();
      } catch (error) {
        console.warn('[SummarizerService] Error destroying summarizer:', error);
      }
    }
  }

  /**
   * Helper to create a timeout promise
   */
  private _timeout(ms: number, message: string): Promise<never> {
    return new Promise((_, reject) => {
      setTimeout(() => reject(new Error(message)), ms);
    });
  }

  /**
   * Extractive summarization fallback
   * Uses simple sentence extraction heuristics
   */
  private _summarizeExtractively(text: string, maxLength: number): Promise<string> {
    // Split into sentences
    const sentences = text
      .replace(/([.?!])\s+/g, '$1|')
      .split('|')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    if (sentences.length === 0) {
      return Promise.resolve(text.substring(0, maxLength));
    }

    // Strategy: Take first few sentences that fit within maxLength
    const summary: string[] = [];
    let currentLength = 0;

    for (const sentence of sentences) {
      if (currentLength + sentence.length + 1 > maxLength) {
        break;
      }
      summary.push(sentence);
      currentLength += sentence.length + 1; // +1 for space
    }

    // If we got at least one sentence, return it
    if (summary.length > 0) {
      return Promise.resolve(summary.join(' '));
    }

    // Otherwise, truncate intelligently at sentence boundary
    const truncated = text.substring(0, maxLength);
    const lastPeriod = truncated.lastIndexOf('.');
    const lastQuestion = truncated.lastIndexOf('?');
    const lastExclamation = truncated.lastIndexOf('!');

    const lastSentenceEnd = Math.max(lastPeriod, lastQuestion, lastExclamation);

    if (lastSentenceEnd > maxLength / 2) {
      // Found a sentence boundary in the second half, use it
      return Promise.resolve(truncated.substring(0, lastSentenceEnd + 1));
    } else {
      // No good sentence boundary, just truncate
      return Promise.resolve(truncated + '...');
    }
  }

  /**
   * Check if Chrome Summarizer API is available
   */
  isAIApiAvailable(): boolean {
    return this.isApiAvailable;
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
