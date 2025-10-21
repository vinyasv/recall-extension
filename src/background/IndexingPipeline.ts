/**
 * IndexingPipeline - Orchestrates the full indexing workflow
 * Stages: Content Extraction → Passage Embeddings → Page Embedding → Storage
 */

import type { QueuedPage } from './IndexingQueue';
import type { ExtractedContent } from '../content/ContentExtractor';
import { embeddingGemmaService } from '../lib/embeddings/EmbeddingGemmaService';
import { vectorStore } from '../lib/storage/VectorStore';
import { loggers } from '../lib/utils/logger';

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
    loggers.indexingPipeline.debug('Initializing...');

    // Initialize services (no summarizer needed - we use passages directly)
    await embeddingGemmaService.initialize();
    await vectorStore.initialize();

    const modelInfo = embeddingGemmaService.getModelInfo();
    loggers.indexingPipeline.debug('Initialized');
    loggers.indexingPipeline.info('Using EmbeddingGemma:', modelInfo.dimensions + 'd, ' + modelInfo.parameters + ' params');
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
      loggers.indexingPipeline.info('🚀 Processing:', queuedPage.url);

      // Stage 1: Extract content from the page
      loggers.indexingPipeline.debug('Stage 1: Extracting content...');
      const content = await this._extractContent(queuedPage.tabId, queuedPage.url);
      if (!content) {
        return { success: false, error: 'Failed to extract content' };
      }

      loggers.indexingPipeline.debug('✅ Content extracted:', content.textLength, 'chars, title:', content.title.substring(0, 50));

      // Validate passages
      if (!content.passages || content.passages.length === 0) {
        console.warn('[IndexingPipeline] ❌ No passages extracted from content!');
        console.warn('[IndexingPipeline] Content length:', content.textLength, 'chars');
        console.warn('[IndexingPipeline] Title:', content.title?.substring(0, 100));
        console.warn('[IndexingPipeline] Content preview:', content.content?.substring(0, 200));
        return { success: false, error: 'No passages extracted from content' };
      }

      console.log('[IndexingPipeline] ✅ Content extracted:', content.textLength, 'chars');
      console.log('[IndexingPipeline] ✅ Passages extracted:', content.passages.length);
      console.log('[IndexingPipeline] Sample passage:', content.passages[0]?.text?.substring(0, 100));

      // Stage 2: Generate embeddings for passages (PASSAGE-ONLY APPROACH)
      console.log('[IndexingPipeline] Stage 2: Generating', content.passages.length, 'passage embeddings...');
      const passagesWithEmbeddings = await this._generatePassageEmbeddings(content.passages, content.title);
      console.log('[IndexingPipeline] ✅ Embedded', passagesWithEmbeddings.length, 'passages');
      console.log('[IndexingPipeline] Embedding dimension:', passagesWithEmbeddings[0]?.embedding?.length);

      // Stage 3: Store in database (no title/URL/page embeddings needed)
      console.log('[IndexingPipeline] Stage 3: Storing in database...');
      const pageId = await this._storePage({
        url: queuedPage.url,
        title: content.title,
        content: content.content,
        passages: passagesWithEmbeddings,
        timestamp: queuedPage.startTime,
        dwellTime: queuedPage.dwellTime,
      });

      const totalTime = Date.now() - startTime;
      loggers.indexingPipeline.info('🎉 Page indexed successfully! ID:', pageId, 'Time:', totalTime + 'ms');

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
  ): Promise<ExtractedContent | null> {
    try {
      loggers.indexingPipeline.debug('Extracting content from tab:', tabId, 'URL:', expectedUrl);

      // Check if tab still exists
      const tab = await chrome.tabs.get(tabId).catch(() => null);
      if (!tab) {
        console.warn('[IndexingPipeline] Tab no longer exists:', tabId);
        return null;
      }

      loggers.indexingPipeline.debug('Tab exists, current URL:', tab.url);

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
      // Wrap in try-catch to handle connection errors gracefully
      loggers.indexingPipeline.debug('Sending EXTRACT_CONTENT message to tab:', tabId);
      let response;
      try {
        response = await chrome.tabs.sendMessage(tabId, { type: 'EXTRACT_CONTENT' });
        loggers.indexingPipeline.debug('Received response from content script');
      } catch (sendError: any) {
        // If we get a connection error, it means content script isn't loaded yet
        if (sendError.message?.includes('Could not establish connection') ||
            sendError.message?.includes('Receiving end does not exist')) {
          console.warn('[IndexingPipeline] Content script not loaded on this tab');
          console.warn('[IndexingPipeline] This happens for tabs that were open before extension reload');
          console.warn('[IndexingPipeline] → The page needs to be refreshed to load the content script');
          throw new Error('Content script not loaded');
        }
        throw sendError;
      }

      // Validate response format
      if (!response) {
        console.warn('[IndexingPipeline] No response from content script');
        throw new Error('No response from content script');
      }

      if (!response.success) {
        const errorMsg = response.error || 'Content extraction failed';
        console.warn('[IndexingPipeline] Content script reported failure:', errorMsg);
        throw new Error(errorMsg);
      }

      if (!response.data) {
        console.warn('[IndexingPipeline] Content script returned success but no data');
        throw new Error('Content script returned success but no data');
      }

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
    } catch (error) {
      console.error('[IndexingPipeline] Content extraction error:', error);

      // With CRXJS and ES modules, we cannot dynamically inject content scripts
      // Content scripts are automatically injected via manifest.json for all pages
      // If the content script is not responding, the page may have been navigated away
      // or the content script failed to load on that particular page
      console.warn('[IndexingPipeline] Content script not responding. This may happen if:');
      console.warn('  1. The tab was closed or navigated away');
      console.warn('  2. The page is a restricted URL (chrome://, chrome-extension://, etc.)');
      console.warn('  3. The page loaded before the extension was installed');
      console.warn('  → Skipping this page. Content scripts will be available after page reload.');

      return null;
    }
  }

  /**
   * Generate embeddings for passages (batch processing)
   * CRITICAL: All passages must have embeddings - will fail if any embedding generation fails
   * 
   * @param passages Array of passages to embed
   * @param pageTitle Optional page title to include in embeddings (improves quality per official docs)
   */
  private async _generatePassageEmbeddings(passages: any[], pageTitle?: string): Promise<any[]> {
    const batchSize = 5; // Process 5 passages at a time
    const passagesWithEmbeddings: any[] = [];

    for (let i = 0; i < passages.length; i += batchSize) {
      const batch = passages.slice(i, i + batchSize);
      loggers.indexingPipeline.debug(`Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(passages.length / batchSize)}`);

      // Generate embeddings for the batch
      // If this fails, we want the entire indexing job to fail (no silent fallback)
      const batchPromises = batch.map(async (passage) => {
        const embedding = await this._generateEmbedding(passage.text, pageTitle);
        return {
          ...passage,
          embedding,
        };
      });

      const batchResults = await Promise.all(batchPromises);
      passagesWithEmbeddings.push(...batchResults);
    }

    // Validate that all passages have embeddings
    const missingEmbeddings = passagesWithEmbeddings.filter(p => !p.embedding);
    if (missingEmbeddings.length > 0) {
      throw new Error(`${missingEmbeddings.length} passages are missing embeddings - indexing failed`);
    }

    return passagesWithEmbeddings;
  }

  /**
   * Generate embedding from text
   * Uses 'document' task type for proper EmbeddingGemma prefixing
   * 
   * @param text Passage text to embed
   * @param pageTitle Optional page title (improves embedding quality per official EmbeddingGemma docs)
   */
  private async _generateEmbedding(text: string, pageTitle?: string): Promise<Float32Array> {
    // Use 'document' task type for indexing (applies "title: {title} | text:" prefix)
    // Official docs: "providing a title, if available, will improve model performance"
    return await embeddingGemmaService.generateEmbedding(text, 'document', 768, pageTitle);
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
   * Store page in database and notify UI of new content
   */
  private async _storePage(data: {
    url: string;
    title: string;
    content: string;
    passages: any[];
    timestamp: number;
    dwellTime: number;
  }): Promise<string> {
    // Check if page already exists
    const existing = await vectorStore.getPageByUrl(data.url);
    let pageId: string;
    let isUpdate = false;

    if (existing) {
      // Update existing page and increment visit count
      await vectorStore.updatePage(existing.id, {
        title: data.title,
        content: data.content,
        passages: data.passages,
        timestamp: data.timestamp,
        dwellTime: data.dwellTime,
        visitCount: existing.visitCount + 1, // Increment visit count
      });
      pageId = existing.id;
      isUpdate = true;
      loggers.indexingPipeline.debug(`Page re-visited (visitCount: ${existing.visitCount} → ${existing.visitCount + 1})`);
    } else {
      // Add new page
      pageId = await vectorStore.addPage({
        url: data.url,
        title: data.title,
        content: data.content,
        passages: data.passages,
        timestamp: data.timestamp,
        dwellTime: data.dwellTime,
        lastAccessed: 0,
        visitCount: 1, // First visit
      });
      loggers.indexingPipeline.debug('New page indexed (visitCount: 1)');
    }

    // Broadcast to all tabs that a page has been indexed
    // This allows the sidebar UI to update in real-time
    this._broadcastPageIndexed({
      id: pageId,
      url: data.url,
      title: data.title,
      timestamp: data.timestamp,
      isUpdate,
    });

    return pageId;
  }

  /**
   * Broadcast page indexed event to all tabs
   */
  private _broadcastPageIndexed(pageInfo: {
    id: string;
    url: string;
    title: string;
    timestamp: number;
    isUpdate: boolean;
  }): void {
    // Query all tabs and send the message
    chrome.tabs.query({}, (tabs) => {
      tabs.forEach((tab) => {
        if (tab.id) {
          chrome.tabs.sendMessage(tab.id, {
            type: 'PAGE_INDEXED',
            data: pageInfo,
          }).catch(() => {
            // Silently ignore errors (tab may not have content script loaded)
          });
        }
      });
    });

    loggers.indexingPipeline.debug('📢 Broadcast PAGE_INDEXED:', pageInfo.title);
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
