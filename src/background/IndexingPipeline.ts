/**
 * IndexingPipeline - Orchestrates the full indexing workflow
 * Stages: Content Extraction → Summarization → Embedding → Storage
 */

import type { QueuedPage } from './IndexingQueue';
import { embeddingService } from '../lib/embeddings/EmbeddingService';
import { summarizerService } from '../lib/summarizer/SummarizerService';
import { vectorStore } from '../lib/storage/VectorStore';

export interface IndexingResult {
  success: boolean;
  pageId?: string;
  error?: string;
}

/**
 * IndexingPipeline class
 */
export class IndexingPipeline {
  private isProcessing: boolean = false;
  private processingRate: number = 500; // 500ms between pages (mainly for API rate limiting)

  /**
   * Initialize the pipeline
   */
  async initialize(): Promise<void> {
    console.log('[IndexingPipeline] Initializing...');

    // Initialize services
    await embeddingService.initialize();
    await summarizerService.initialize();
    await vectorStore.initialize();

    console.log('[IndexingPipeline] Initialized');
  }

  /**
   * Process a queued page through the full pipeline
   */
  async processPage(queuedPage: QueuedPage): Promise<IndexingResult> {
    if (this.isProcessing) {
      return { success: false, error: 'Pipeline already processing another page' };
    }

    this.isProcessing = true;
    const startTime = Date.now();

    try {
      console.log('[IndexingPipeline] 🚀 Processing:', queuedPage.url);

      // Stage 1: Extract content from the page
      console.log('[IndexingPipeline] Stage 1: Extracting content...');
      const content = await this._extractContent(queuedPage.tabId, queuedPage.url);
      if (!content) {
        return { success: false, error: 'Failed to extract content' };
      }

      console.log('[IndexingPipeline] ✅ Content extracted:', content.textLength, 'chars, title:', content.title.substring(0, 50));

      // Check minimum length
      if (content.textLength < 100) {
        return { success: false, error: 'Content too short (< 100 chars)' };
      }

      // Stage 2: Generate summary
      console.log('[IndexingPipeline] Stage 2: Generating summary...');
      const summary = await this._generateSummary(content.content, queuedPage.url, content.title);
      console.log('[IndexingPipeline] ✅ Summary generated:', summary.length, 'chars -', summary.substring(0, 100) + '...');

      // Combine title + summary for better embedding context
      const embeddingText = content.title ? `${content.title}. ${summary}` : summary;
      console.log('[IndexingPipeline] Embedding text length:', embeddingText.length, 'chars');

      // Stage 3: Generate embedding
      console.log('[IndexingPipeline] Stage 3: Generating embedding...');
      const embedding = await this._generateEmbedding(embeddingText);
      console.log('[IndexingPipeline] ✅ Embedding generated:', embedding.length, 'dimensions');

      // Stage 4: Store in database
      console.log('[IndexingPipeline] Stage 4: Storing in database...');
      const pageId = await this._storePage({
        url: queuedPage.url,
        title: content.title,
        content: content.content,
        summary,
        embedding,
        timestamp: queuedPage.startTime,
        dwellTime: queuedPage.dwellTime,
      });

      const totalTime = Date.now() - startTime;
      console.log('[IndexingPipeline] 🎉 Page indexed successfully! ID:', pageId, 'Time:', totalTime + 'ms');

      return { success: true, pageId };
    } catch (error) {
      console.error('[IndexingPipeline] ❌ Processing failed:', error);
      return { success: false, error: (error as Error).message };
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Extract content from a page
   */
  private async _extractContent(
    tabId: number,
    expectedUrl: string
  ): Promise<{ title: string; content: string; textLength: number } | null> {
    try {
      // Check if tab still exists
      const tab = await chrome.tabs.get(tabId).catch(() => null);
      if (!tab) {
        console.warn('[IndexingPipeline] Tab no longer exists:', tabId);
        return null;
      }

      // IMPORTANT: Validate the tab URL matches what we expect
      // This prevents race conditions when user switches tabs/navigates
      const currentUrl = tab.url || '';
      const normalizedExpected = this._normalizeUrl(expectedUrl);
      const normalizedCurrent = this._normalizeUrl(currentUrl);
      
      if (normalizedExpected !== normalizedCurrent) {
        console.warn(
          '[IndexingPipeline] Tab URL mismatch - race condition detected!',
          '\n  Expected:', expectedUrl,
          '\n  Current:', currentUrl,
          '\n  → Aborting to prevent data corruption'
        );
        return null;
      }

      // Send message to content script to extract content
      const response = await chrome.tabs.sendMessage(tabId, { type: 'EXTRACT_CONTENT' });

      if (response.success && response.data) {
        // Double-check: validate the extracted URL matches expected
        if (response.data.url) {
          const extractedNormalized = this._normalizeUrl(response.data.url);
          if (extractedNormalized !== normalizedExpected) {
            console.warn(
              '[IndexingPipeline] Extracted URL mismatch - race condition!',
              '\n  Expected:', expectedUrl,
              '\n  Extracted:', response.data.url,
              '\n  → Aborting'
            );
            return null;
          }
        }
        
        return response.data;
      } else {
        throw new Error(response.error || 'Content extraction failed');
      }
    } catch (error) {
      console.error('[IndexingPipeline] Content extraction error:', error);

      // If content script is not loaded, try to inject it
      try {
        await chrome.scripting.executeScript({
          target: { tabId },
          files: ['content.js'],
        });

        // Wait a moment for the script to initialize
        await new Promise((resolve) => setTimeout(resolve, 500));

        // Try again
        const response = await chrome.tabs.sendMessage(tabId, { type: 'EXTRACT_CONTENT' });

        if (response.success && response.data) {
          return response.data;
        }
      } catch (injectionError) {
        console.error('[IndexingPipeline] Content script injection failed:', injectionError);
      }

      return null;
    }
  }

  /**
   * Generate summary from content
   */
  private async _generateSummary(content: string, url: string, title: string): Promise<string> {
    try {
      const summary = await summarizerService.summarizeForSearch(content, url, title, 800);
      return summary;
    } catch (error) {
      console.error('[IndexingPipeline] Summarization failed:', error);
      // Fallback: use first 800 characters
      return content.substring(0, 800);
    }
  }

  /**
   * Generate embedding from summary
   */
  private async _generateEmbedding(text: string): Promise<Float32Array> {
    return await embeddingService.generateEmbedding(text);
  }

  /**
   * Normalize URL for comparison
   * Removes query parameters and fragments that might differ
   */
  private _normalizeUrl(url: string): string {
    try {
      const urlObj = new URL(url);
      // Use protocol + hostname + pathname for comparison
      // This ignores query params, fragments, and trailing slashes
      return `${urlObj.protocol}//${urlObj.hostname}${urlObj.pathname}`.replace(/\/$/, '');
    } catch {
      // If URL parsing fails, return as-is
      return url;
    }
  }

  /**
   * Store page in database
   */
  private async _storePage(data: {
    url: string;
    title: string;
    content: string;
    summary: string;
    embedding: Float32Array;
    timestamp: number;
    dwellTime: number;
  }): Promise<string> {
    // Check if page already exists
    const existing = await vectorStore.getPageByUrl(data.url);
    if (existing) {
      // Update existing page
      await vectorStore.updatePage(existing.id, {
        title: data.title,
        content: data.content,
        summary: data.summary,
        embedding: data.embedding,
        timestamp: data.timestamp,
        dwellTime: data.dwellTime,
      });
      return existing.id;
    } else {
      // Add new page
      return await vectorStore.addPage({
        url: data.url,
        title: data.title,
        content: data.content,
        summary: data.summary,
        embedding: data.embedding,
        timestamp: data.timestamp,
        dwellTime: data.dwellTime,
        lastAccessed: 0,
      });
    }
  }

  /**
   * Check if currently processing
   */
  isCurrentlyProcessing(): boolean {
    return this.isProcessing;
  }

  /**
   * Get processing rate (ms between pages)
   */
  getProcessingRate(): number {
    return this.processingRate;
  }

  /**
   * Set processing rate
   */
  setProcessingRate(ms: number): void {
    this.processingRate = ms;
  }
}

// Export singleton instance
export const indexingPipeline = new IndexingPipeline();
