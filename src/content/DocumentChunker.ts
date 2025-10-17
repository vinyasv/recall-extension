/**
 * DocumentChunker - Chrome-inspired passage-based document chunking
 *
 * Breaks down web pages into semantic passages for better search granularity
 * Based on Chrome's DocumentChunker architecture with 200-word passages limit
 */

import type { Passage } from '../lib/storage/types';
import { CHUNKER_CONFIG, CONTENT_SELECTORS } from '../lib/constants/contentSelectors';
import { loggers } from '../lib/utils/logger';

/**
 * DocumentChunker class for processing DOM into semantic passages
 */
export class DocumentChunker {
  private config: typeof CHUNKER_CONFIG;
  private passageCounter: number = 0;

  constructor(config?: Partial<typeof CHUNKER_CONFIG>) {
    this.config = { ...CHUNKER_CONFIG, ...config };
  }

  /**
   * Chunk a document into semantic passages
   * @param document - The DOM document to chunk
   * @returns Array of passages
   */
  chunkDocument(document: Document): Passage[] {
    return loggers.documentChunker.timed('document-chunking', () => {
      loggers.documentChunker.debug('Starting document chunking...');
      this.passageCounter = 0;

      // Find the main content area first
      const mainContent = this.findMainContent(document);
      if (!mainContent) {
        loggers.documentChunker.warn('No main content found, falling back to body');
        return [];
      }

      // Process the main content
      const passages = this.processNode(mainContent, 0);

      // Sort by position and limit
      const sortedPassages = passages
        .sort((a, b) => a.position - b.position)
        .slice(0, this.config.MAX_PASSAGES_PER_PAGE);

      loggers.documentChunker.debug(`Generated ${sortedPassages.length} passages`);
      return sortedPassages;
    });
  }

  /**
   * Find the main content area of the document
   */
  private findMainContent(document: Document): Element | null {
    // Try semantic HTML5 elements first
    const article = document.querySelector('article');
    if (article && this.hasSubstantialContent(article)) {
      loggers.documentChunker.debug('Using <article> element');
      return article;
    }

    const main = document.querySelector('main');
    if (main && this.hasSubstantialContent(main)) {
      loggers.documentChunker.debug('Using <main> element');
      return main;
    }

    // Try shared content selectors
    for (const selector of CONTENT_SELECTORS) {
      const element = document.querySelector(selector);
      if (element && this.hasSubstantialContent(element)) {
        loggers.documentChunker.debug(`Using selector: ${selector}`);
        return element;
      }
    }

    // Fall back to body with filtering
    loggers.documentChunker.debug('Using body with filtering');
    return document.body;
  }

  /**
   * Check if element has substantial content
   */
  private hasSubstantialContent(element: Element): boolean {
    const text = element.textContent || '';
    const trimmed = text.trim();
    return trimmed.length > 200;
  }

  /**
   * Process a node recursively to extract passages (BOTTOM-UP approach)
   * Chrome-inspired: Process children first, then aggregate siblings
   */
  private processNode(node: Node, depth: number): Passage[] {
    // Handle text nodes (leaf nodes)
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent?.trim();
      if (text && text.length > this.config.MIN_WORD_COUNT * 3) {
        const words = text.split(/\s+/);
        if (words.length >= this.config.MIN_WORD_COUNT) {
          // Use multi-passage generation instead of single passage
          return this.createPassagesFromText(text, undefined, this.passageCounter);
        }
      }
      return [];
    }

    // Handle element nodes
    if (node.nodeType === Node.ELEMENT_NODE) {
      const element = node as Element;
      const tagName = element.tagName.toLowerCase();

      // Skip unwanted elements
      if (this.isUnwantedElement(tagName, element)) {
        return [];
      }

      // BOTTOM-UP: First process all children recursively
      const childPassages: Passage[] = [];
      for (let i = 0; i < element.childNodes.length; i++) {
        const child = element.childNodes[i];
        const passages = this.processNode(child, depth + 1);
        childPassages.push(...passages);
      }

      // Handle block-level elements
      if (this.isBlockLevelElement(tagName)) {
        const text = this.extractTextFromElement(element);

        // If element has substantial content and no children were processed
        if (text && this.meetsMinimumRequirements(text) && childPassages.length === 0) {
          // Create passages from this block's text (multi-passage if needed)
          return this.createPassagesFromText(text, element, this.passageCounter);
        }

        // If we already have child passages, try to aggregate them
        if (childPassages.length > 0 && this.config.GREEDILY_AGGREGATE_SIBLINGS) {
          return this.aggregateSiblingPassages(childPassages, element);
        }

        return childPassages;
      } else {
        // Inline elements: return child passages with sibling aggregation
        if (childPassages.length > 0 && this.config.GREEDILY_AGGREGATE_SIBLINGS) {
          return this.aggregateSiblingPassages(childPassages, element);
        }
        return childPassages;
      }
    }

    return [];
  }

  /**
   * Check if an element should be skipped
   */
  private isUnwantedElement(tagName: string, element: Element): boolean {
    const unwantedTags = [
      'script', 'style', 'nav', 'header', 'footer',
      'aside', '.advertisement', '.ad', '.sidebar',
      '.comments', '.related-posts', '.menu'
    ];

    const className = element.className.toLowerCase();
    const id = element.id.toLowerCase();

    return (
      unwantedTags.includes(tagName) ||
      tagName.includes('nav') ||
      tagName.includes('menu') ||
      tagName.includes('sidebar') ||
      tagName.includes('footer') ||
      tagName.includes('header') ||
      className.includes('nav') ||
      className.includes('menu') ||
      className.includes('sidebar') ||
      className.includes('footer') ||
      className.includes('header') ||
      className.includes('ad') ||
      id.includes('nav') ||
      id.includes('menu') ||
      id.includes('sidebar') ||
      id.includes('footer') ||
      id.includes('header') ||
      id.includes('ad')
    );
  }

  /**
   * Check if element is block-level
   */
  private isBlockLevelElement(tagName: string): boolean {
    const blockTags = [
      'p', 'div', 'section', 'article', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
      'li', 'td', 'th', 'blockquote', 'pre', 'figure'
    ];
    return blockTags.includes(tagName);
  }

  /**
   * Extract text from an element, cleaning it first
   */
  private extractTextFromElement(element: Element): string {
    // Clone the element to avoid modifying the DOM
    const clone = element.cloneNode(true) as Element;

    // Remove unwanted nested elements
    const unwantedSelectors = [
      'script', 'style', 'nav', 'header', 'footer', '.advertisement',
      '.ad', '.sidebar', '.comments', '.related-posts'
    ];

    unwantedSelectors.forEach((selector) => {
      clone.querySelectorAll(selector).forEach((el) => el.remove());
    });

    return clone.textContent?.trim() || '';
  }

  /**
   * Check if text meets minimum requirements for a passage
   */
  private meetsMinimumRequirements(text: string): boolean {
    const words = text.split(/\s+/);
    return words.length >= this.config.MIN_WORD_COUNT && text.trim().length > 20;
  }

  /**
   * Aggregate sibling passages by merging them when possible
   * Chrome-inspired: Greedily combine related passages under the same parent
   */
  private aggregateSiblingPassages(passages: Passage[], parentElement: Node): Passage[] {
    if (passages.length === 0) {
      return passages;
    }

    const aggregated: Passage[] = [];
    let currentChunk: Passage[] = [];
    let currentWordCount = 0;

    for (const passage of passages) {
      const potentialWordCount = currentWordCount + passage.wordCount;

      // Can we add this passage to current chunk?
      if (potentialWordCount <= this.config.MAX_WORDS_PER_PASSAGE) {
        currentChunk.push(passage);
        currentWordCount = potentialWordCount;
      } else if (potentialWordCount <= this.config.MAX_WORDS_PER_PASSAGE * this.config.SIBLING_MERGE_THRESHOLD) {
        // Still close enough to threshold, merge anyway
        currentChunk.push(passage);
        currentWordCount = potentialWordCount;
      } else {
        // Chunk is full, save it and start new chunk
        if (currentChunk.length > 0) {
          aggregated.push(this.mergePassages(currentChunk, parentElement));
        }
        currentChunk = [passage];
        currentWordCount = passage.wordCount;
      }
    }

    // Don't forget the last chunk
    if (currentChunk.length > 0) {
      aggregated.push(this.mergePassages(currentChunk, parentElement));
    }

    return aggregated;
  }

  /**
   * Merge multiple passages into a single passage
   */
  private mergePassages(passages: Passage[], parentElement?: Node): Passage {
    if (passages.length === 1) {
      return passages[0];
    }

    // Combine text from all passages
    const combinedText = passages.map(p => p.text).join(' ');
    const totalWords = passages.reduce((sum, p) => sum + p.wordCount, 0);

    // Calculate average quality (weighted by word count)
    const weightedQuality = passages.reduce((sum, p) => sum + (p.quality * p.wordCount), 0) / totalWords;

    // Use position of first passage
    const position = passages[0].position;

    // Get element info from parent or first passage
    const element = parentElement instanceof Element
      ? {
          tagName: parentElement.tagName.toLowerCase(),
          className: parentElement.className,
          id: parentElement.id,
        }
      : passages[0].element;

    return {
      id: `passage-${++this.passageCounter}`,
      text: combinedText,
      wordCount: totalWords,
      position,
      quality: weightedQuality,
      element,
    };
  }

  /**
   * Create one or more passages from text (multi-passage generation)
   * Chrome-inspired: Split long content intelligently instead of truncating
   */
  private createPassagesFromText(text: string, element?: Element, startPosition: number = 0): Passage[] {
    const words = text.split(/\s+/);

    // If text fits in one passage, simple case
    if (words.length <= this.config.MAX_WORDS_PER_PASSAGE) {
      return [this.createSinglePassage(text, element, startPosition)];
    }

    // Multi-passage case: split intelligently
    const passages: Passage[] = [];
    let currentIndex = 0;

    while (currentIndex < words.length) {
      const remainingWords = words.length - currentIndex;
      const chunkSize = Math.min(remainingWords, this.config.MAX_WORDS_PER_PASSAGE);
      const chunkWords = words.slice(currentIndex, currentIndex + chunkSize);
      let chunkText = chunkWords.join(' ');

      // Try to find semantic boundary if enabled
      if (this.config.PREFER_SEMANTIC_BOUNDARIES && remainingWords > this.config.MAX_WORDS_PER_PASSAGE) {
        const adjustedText = this.findSemanticBoundary(chunkText);
        if (adjustedText !== chunkText) {
          chunkText = adjustedText;
        }
      }

      const passage = this.createSinglePassage(chunkText, element, startPosition + passages.length);
      passages.push(passage);

      currentIndex += chunkText.split(/\s+/).length;
    }

    return passages;
  }

  /**
   * Find semantic boundary (sentence or paragraph end) near the split point
   * Chrome-inspired: Avoid cutting passages mid-sentence
   */
  private findSemanticBoundary(text: string): string {
    // Try to find sentence boundaries near the end
    const sentences = text.split(/([.!?][\s"')\]]+)/);

    if (sentences.length > 1) {
      // Find the last complete sentence that keeps us reasonably close to max length
      const minLength = text.length * this.config.MIN_BOUNDARY_POSITION;
      let bestBoundary = text;

      for (let i = sentences.length - 1; i >= 0; i -= 2) {
        const candidate = sentences.slice(0, i + 2).join('');
        if (candidate.length >= minLength) {
          bestBoundary = candidate.trim();
          break;
        }
      }

      return bestBoundary;
    }

    // No sentence boundary found, try paragraph boundary
    const paragraphBreak = text.lastIndexOf('\n\n');
    if (paragraphBreak > text.length * this.config.MIN_BOUNDARY_POSITION) {
      return text.substring(0, paragraphBreak).trim();
    }

    // No good boundary found, return as-is
    return text;
  }

  /**
   * Create a single passage from text
   */
  private createSinglePassage(text: string, element?: Element, position: number = 0): Passage {
    const words = text.split(/\s+/);
    const wordCount = words.length;
    const quality = this.calculatePassageQuality(text);

    return {
      id: `passage-${++this.passageCounter}`,
      text: text.trim(),
      wordCount,
      position,
      quality,
      element: element ? {
        tagName: element.tagName.toLowerCase(),
        className: element.className,
        id: element.id,
      } : undefined,
    };
  }


  /**
   * Calculate quality score for a passage
   */
  private calculatePassageQuality(text: string): number {
    let score = 0.5; // Base score

    // Length scoring (prefer medium-length passages)
    const wordCount = text.split(/\s+/).length;
    if (wordCount >= 10 && wordCount <= 100) {
      score += 0.2;
    } else if (wordCount > 100) {
      score += 0.1;
    }

    // Sentence structure (prefer multiple sentences)
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 10);
    if (sentences.length >= 2) {
      score += 0.1;
    }

    // Content indicators (prefer content with substance)
    if (/\b(because|however|therefore|although|meanwhile|furthermore|moreover)\b/i.test(text)) {
      score += 0.1;
    }

    // Penalize very short or repetitive content
    const uniqueWords = new Set(text.toLowerCase().split(/\s+/));
    if (uniqueWords.size < wordCount * 0.3) {
      score -= 0.2;
    }

    return Math.max(0, Math.min(1, score));
  }

  /**
   * Get current configuration
   */
  getConfig(): typeof CHUNKER_CONFIG {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<typeof CHUNKER_CONFIG>): void {
    this.config = { ...this.config, ...newConfig };
  }
}