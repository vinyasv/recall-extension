/**
 * ContentExtractor - Intelligently extracts main content from web pages
 */

export interface ExtractedContent {
  title: string;
  content: string;
  url: string;
  textLength: number;
}

/**
 * ContentExtractor class for extracting meaningful content from DOM
 */
export class ContentExtractor {
  /**
   * Extract content from the current page
   */
  static async extract(): Promise<ExtractedContent> {
    const url = window.location.href;
    const title = document.title || '';

    await this._waitForDynamicContent();

    // Extract main content
    const content = this._extractMainContent();

    // Clean the content
    const cleanedContent = this._cleanText(content);

    return {
      title,
      content: cleanedContent,
      url,
      textLength: cleanedContent.length,
    };
  }

  /**
   * Extract main content using multiple heuristics
   */
  private static _extractMainContent(): string {
    // Strategy 1: Look for semantic HTML5 elements
    const article = document.querySelector('article');
    if (article && this._hasSubstantialContent(article)) {
      console.log('[ContentExtractor] Using <article> tag');
      return this._getTextFromElement(article);
    }

    const main = document.querySelector('main');
    if (main && this._hasSubstantialContent(main)) {
      console.log('[ContentExtractor] Using <main> tag');
      return this._getTextFromElement(main);
    }

    // Strategy 2: Look for elements with specific attributes/classes
    const contentSelectors = [
      '[role="main"]',
      '[role="article"]',
      '.article-content',
      '.post-content',
      '.entry-content',
      '.content-body',
      '.article-body',
      '#content',
      '#main-content',
      '.main-content',
    ];

    for (const selector of contentSelectors) {
      const element = document.querySelector(selector);
      if (element && this._hasSubstantialContent(element)) {
        console.log('[ContentExtractor] Using selector:', selector);
        return this._getTextFromElement(element);
      }
    }

    // Strategy 3: Find the element with the most text content
    const candidates = this._findContentCandidates();
    if (candidates.length > 0) {
      const best = candidates[0];
      console.log('[ContentExtractor] Using content candidate');
      return this._getTextFromElement(best.element);
    }

    // Fallback: Use body but filter out navigation, headers, footers
    console.log('[ContentExtractor] Using body with filtering');
    return this._getTextFromBody();
  }

  /**
   * Check if element has substantial content
   */
  private static _hasSubstantialContent(element: Element): boolean {
    const text = element.textContent || '';
    const trimmed = text.trim();
    return trimmed.length > 200; // Minimum 200 characters
  }

  /**
   * Get clean text from an element
   */
  private static _getTextFromElement(element: Element): string {
    // Clone the element to avoid modifying the DOM
    const clone = element.cloneNode(true) as Element;

    // Remove unwanted elements
    const unwantedSelectors = [
      'script',
      'style',
      'nav',
      'header',
      'footer',
      '.advertisement',
      '.ad',
      '.sidebar',
      '.comments',
      '.related-posts',
      '[role="navigation"]',
      '[role="complementary"]',
    ];

    unwantedSelectors.forEach((selector) => {
      clone.querySelectorAll(selector).forEach((el) => el.remove());
    });

    // Extract text from paragraphs, headings, and lists
    const textElements: string[] = [];

    // Get headings
    clone.querySelectorAll('h1, h2, h3, h4, h5, h6').forEach((heading) => {
      const text = heading.textContent?.trim();
      if (text) {
        textElements.push(text);
      }
    });

    // Get paragraphs
    clone.querySelectorAll('p').forEach((p) => {
      const text = p.textContent?.trim();
      if (text && text.length > 20) {
        // Skip very short paragraphs
        textElements.push(text);
      }
    });

    // Get list items
    clone.querySelectorAll('li').forEach((li) => {
      const text = li.textContent?.trim();
      if (text && text.length > 10) {
        textElements.push(text);
      }
    });

    // If we found structured content, use it
    if (textElements.length > 0) {
      return textElements.join('\n\n');
    }

    // Otherwise, fall back to all text content
    return clone.textContent || '';
  }

  /**
   * Find potential content containers by analyzing text density
   */
  private static _findContentCandidates(): Array<{ element: Element; score: number }> {
    const candidates: Array<{ element: Element; score: number }> = [];

    // Look at divs, sections, and articles
    const containers = document.querySelectorAll('div, section, article');

    containers.forEach((container) => {
      // Skip if too small
      const text = container.textContent || '';
      if (text.trim().length < 200) {
        return;
      }

      // Calculate a score based on multiple factors
      let score = 0;

      // 1. Text length (more is better)
      score += Math.min(text.length / 100, 50);

      // 2. Paragraph count (more is better)
      const paragraphs = container.querySelectorAll('p');
      score += Math.min(paragraphs.length * 5, 30);

      // 3. Average paragraph length (longer is better)
      let totalPLength = 0;
      paragraphs.forEach((p) => {
        totalPLength += (p.textContent || '').length;
      });
      const avgPLength = paragraphs.length > 0 ? totalPLength / paragraphs.length : 0;
      score += Math.min(avgPLength / 10, 20);

      // 4. Penalize if it contains navigation/footer keywords
      const className = container.className.toLowerCase();
      const id = container.id.toLowerCase();
      if (
        className.includes('nav') ||
        className.includes('menu') ||
        className.includes('sidebar') ||
        className.includes('footer') ||
        className.includes('header') ||
        id.includes('nav') ||
        id.includes('menu') ||
        id.includes('sidebar') ||
        id.includes('footer') ||
        id.includes('header')
      ) {
        score -= 50;
      }

      // 5. Bonus for content-related keywords
      if (
        className.includes('content') ||
        className.includes('article') ||
        className.includes('post') ||
        className.includes('entry') ||
        id.includes('content') ||
        id.includes('article') ||
        id.includes('post')
      ) {
        score += 25;
      }

      candidates.push({ element: container, score });
    });

    // Sort by score descending
    candidates.sort((a, b) => b.score - a.score);

    return candidates;
  }

  /**
   * Get text from body with filtering
   */
  private static _getTextFromBody(): string {
    const body = document.body.cloneNode(true) as Element;

    // Remove unwanted elements
    const unwantedSelectors = [
      'script',
      'style',
      'nav',
      'header',
      'footer',
      '.advertisement',
      '.ad',
      '.sidebar',
      '.menu',
      '[role="navigation"]',
      '[role="banner"]',
      '[role="complementary"]',
      '[role="contentinfo"]',
    ];

    unwantedSelectors.forEach((selector) => {
      body.querySelectorAll(selector).forEach((el) => el.remove());
    });

    return body.textContent || '';
  }

  /**
   * Clean extracted text
   */
  private static _cleanText(text: string): string {
    return (
      text
        // Normalize whitespace
        .replace(/\s+/g, ' ')
        // Normalize newlines
        .replace(/\n+/g, '\n')
        // Remove excessive spaces around newlines
        .replace(/ *\n */g, '\n')
        // Trim
        .trim()
        // Limit length (max 10,000 characters)
        .substring(0, 10000)
    );
  }

  private static async _waitForDynamicContent(options: { minChars?: number; timeoutMs?: number } = {}): Promise<void> {
    const { minChars = 250, timeoutMs = 2500 } = options;

    const currentLength = () => (document.body?.innerText || '').trim().length;
    if (currentLength() >= minChars) {
      return;
    }

    const spaSelectors = ['[data-reactroot]', '#__next', '#root', 'app-root', 'app-shell', '[ng-version]', '#svelte', '#app'];
    const isLikelySpa = spaSelectors.some((selector) => document.querySelector(selector));
    if (!isLikelySpa) {
      return;
    }

    await new Promise<void>((resolve) => {
      const timeout = window.setTimeout(() => {
        observer.disconnect();
        resolve();
      }, timeoutMs);

      const observer = new MutationObserver(() => {
        if (currentLength() >= minChars) {
          window.clearTimeout(timeout);
          observer.disconnect();
          resolve();
        }
      });

      observer.observe(document.body, {
        childList: true,
        subtree: true,
        characterData: true,
      });
    });
  }
}
