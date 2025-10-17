/**
 * IndexingQueue - Persistent FIFO queue for pages to be indexed
 */

import type { TabInfo } from './TabMonitor';

export interface QueuedPage extends TabInfo {
  id: string;
  queuedAt: number;
  attempts: number;
  lastError?: string;
}

const QUEUE_STORAGE_KEY = 'indexingQueue';
const MAX_ATTEMPTS = 3;

/**
 * IndexingQueue class for managing background indexing tasks
 */
export class IndexingQueue {
  private queue: QueuedPage[] = [];
  private isProcessing: boolean = false;

  /**
   * Initialize the queue from storage
   */
  async initialize(): Promise<void> {
    console.log('[IndexingQueue] Initializing...');

    // Load queue from chrome.storage.local
    const result = await chrome.storage.local.get(QUEUE_STORAGE_KEY);
    if (result[QUEUE_STORAGE_KEY]) {
      this.queue = result[QUEUE_STORAGE_KEY];
      console.log('[IndexingQueue] Loaded', this.queue.length, 'items from storage');

      if (this.queue.length > 0) {
        const originalSize = this.queue.length;
        this.queue = this.queue.filter((page) => page.attempts < MAX_ATTEMPTS);
        const removedCount = originalSize - this.queue.length;

        if (removedCount > 0) {
          console.warn(
            `[IndexingQueue] Removed ${removedCount} stale items that exceeded max attempts`
          );
          await this._saveQueue();
        }
      }
    }
  }

  /**
   * Add a page to the queue
   */
  async add(tabInfo: TabInfo): Promise<void> {
    // Check if already in queue (by URL)
    const existingIndex = this.queue.findIndex((item) => item.url === tabInfo.url);
    if (existingIndex !== -1) {
      const existing = this.queue[existingIndex];
      console.log(
        '[IndexingQueue] Page already in queue:',
        tabInfo.url,
        '(attempts:',
        existing.attempts,
        ')'
      );
      return;
    }

    const queuedPage: QueuedPage = {
      ...tabInfo,
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      queuedAt: Date.now(),
      attempts: 0,
    };

    this.queue.push(queuedPage);
    await this._saveQueue();

    console.log('[IndexingQueue] Added page:', tabInfo.url, '(queue size:', this.queue.length, ')');
  }

  /**
   * Get the next page to process
   */
  async getNext(): Promise<QueuedPage | null> {
    // Only log when there is actually work to do
    if (this.queue.length === 0) {
      return null;
    }

    console.log('[IndexingQueue] Fetching next item - queue size:', this.queue.length);

    // Filter out pages that have exceeded max attempts
    let eligible = this.queue.filter((page) => page.attempts < MAX_ATTEMPTS);

    console.log('[IndexingQueue] Eligible items (attempts < 3):', eligible.length);

    if (eligible.length === 0) {
      if (this.queue.length > 0) {
        console.warn('[IndexingQueue] All items exceeded max attempts. Clearing failed items...');
        this.queue.forEach((item) => {
          console.warn(`  - ${item.url}: attempts=${item.attempts}, lastError=${item.lastError}`);
        });
        // Clear all failed items instead of resetting attempts
        this.queue = [];
        await this._saveQueue();
        console.log('[IndexingQueue] Queue cleared of failed items');
      }
      return null;
    }

    // Return the oldest queued page
    console.log('[IndexingQueue] Returning next page:', eligible[0].url);
    return eligible[0];
  }

  /**
   * Mark a page as successfully processed and remove from queue
   */
  async markComplete(pageId: string): Promise<void> {
    const index = this.queue.findIndex((page) => page.id === pageId);
    if (index !== -1) {
      const page = this.queue[index];
      this.queue.splice(index, 1);
      await this._saveQueue();
      console.log('[IndexingQueue] Completed:', page.url);
    }
  }

  /**
   * Mark a page as failed and increment attempt count
   * Permanently removes pages with unrecoverable errors
   */
  async markFailed(pageId: string, error: string): Promise<void> {
    const index = this.queue.findIndex((p) => p.id === pageId);
    if (index === -1) return;

    const page = this.queue[index];

    // Check if this is an unrecoverable error
    const unrecoverableErrors = [
      'Tab no longer exists',
      'Tab URL mismatch',
      'race condition',
      'Content script not loaded',
      'tab was closed',
      'navigated away',
    ];

    const isUnrecoverable = unrecoverableErrors.some((pattern) =>
      error.toLowerCase().includes(pattern.toLowerCase())
    );

    if (isUnrecoverable) {
      // Permanently remove from queue - no retry
      this.queue.splice(index, 1);
      await this._saveQueue();
      console.warn('[IndexingQueue] Permanently removed (unrecoverable error):', page.url);
      console.warn('[IndexingQueue]   Error:', error);
      return;
    }

    // For recoverable errors, increment attempt count
    page.attempts++;
    page.lastError = error;

    if (page.attempts >= MAX_ATTEMPTS) {
      console.error('[IndexingQueue] Max attempts reached for:', page.url);
    }

    await this._saveQueue();
  }

  /**
   * Get queue size
   */
  size(): number {
    return this.queue.filter((page) => page.attempts < MAX_ATTEMPTS).length;
  }

  /**
   * Clear the entire queue
   */
  async clear(): Promise<void> {
    this.queue = [];
    await this._saveQueue();
    console.log('[IndexingQueue] Queue cleared');
  }

  /**
   * Get all queued pages
   */
  getAll(): QueuedPage[] {
    return [...this.queue];
  }

  /**
   * Save queue to storage
   */
  private async _saveQueue(): Promise<void> {
    await chrome.storage.local.set({ [QUEUE_STORAGE_KEY]: this.queue });
  }

  /**
   * Set processing state
   */
  setProcessing(isProcessing: boolean): void {
    this.isProcessing = isProcessing;
  }

  /**
   * Check if currently processing
   */
  isCurrentlyProcessing(): boolean {
    return this.isProcessing;
  }
}

// Export singleton instance
export const indexingQueue = new IndexingQueue();
