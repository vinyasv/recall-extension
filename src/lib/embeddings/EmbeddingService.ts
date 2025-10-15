import { pipeline, type FeatureExtractionPipeline } from '@huggingface/transformers';

/**
 * Service for generating text embeddings using all-MiniLM-L6-v2 model
 * Runs entirely on-device using Transformers.js
 */
export class EmbeddingService {
  private extractor: FeatureExtractionPipeline | null = null;
  private cache: Map<string, Float32Array> = new Map();
  private initPromise: Promise<void> | null = null;
  private readonly MODEL_NAME = 'Xenova/all-MiniLM-L6-v2';
  private readonly MAX_CACHE_SIZE = 1000;

  /**
   * Initialize the embedding model
   * This will download and cache the model on first use
   */
  async initialize(): Promise<void> {
    // If already initialized, return immediately
    if (this.extractor) {
      return;
    }

    // If initialization is in progress, wait for it
    if (this.initPromise) {
      return this.initPromise;
    }

    // Start initialization
    this.initPromise = this._initialize();
    return this.initPromise;
  }

  private async _initialize(): Promise<void> {
    try {
      console.log('[EmbeddingService] Initializing model:', this.MODEL_NAME);

      // Auto-detect environment
      // In Node.js: use 'cpu'
      // In browser: use 'wasm' (or 'webgpu' for GPU acceleration)
      const isNode = typeof process !== 'undefined' && process.versions?.node;
      const device = isNode ? 'cpu' : 'wasm';

      console.log('[EmbeddingService] Running in:', isNode ? 'Node.js' : 'Browser');
      console.log('[EmbeddingService] Using device:', device);

      // Transformers.js v3 types are complex, but this works at runtime
      this.extractor = (await pipeline(
        'feature-extraction',
        this.MODEL_NAME,
        {
          quantized: true, // Use 8-bit quantized model for better performance
          device,
        } as any
      )) as any as FeatureExtractionPipeline;

      console.log('[EmbeddingService] Model initialized successfully');
    } catch (error) {
      console.error('[EmbeddingService] Failed to initialize model:', error);
      this.initPromise = null;
      throw error;
    }
  }

  /**
   * Generate embedding for a given text
   * @param text The text to embed
   * @returns Float32Array of 384 dimensions
   */
  async generateEmbedding(text: string): Promise<Float32Array> {
    // Ensure model is initialized
    if (!this.extractor) {
      await this.initialize();
    }

    if (!this.extractor) {
      throw new Error('Embedding model not initialized');
    }

    // Check cache first
    const cached = this.cache.get(text);
    if (cached) {
      return cached;
    }

    try {
      // Generate embedding
      const output = await this.extractor(text, {
        pooling: 'mean',
        normalize: true,
      });

      // Extract the data as Float32Array
      const embedding = output.data as Float32Array;

      // Cache the result
      this._addToCache(text, embedding);

      return embedding;
    } catch (error) {
      console.error('[EmbeddingService] Failed to generate embedding:', error);
      throw error;
    }
  }

  /**
   * Generate embeddings for multiple texts in batch
   * @param texts Array of texts to embed
   * @returns Array of Float32Array embeddings
   */
  async generateEmbeddings(texts: string[]): Promise<Float32Array[]> {
    const embeddings: Float32Array[] = [];

    for (const text of texts) {
      const embedding = await this.generateEmbedding(text);
      embeddings.push(embedding);
    }

    return embeddings;
  }

  /**
   * Add embedding to cache with LRU eviction
   */
  private _addToCache(text: string, embedding: Float32Array): void {
    // Implement simple LRU: if cache is full, remove oldest entry
    if (this.cache.size >= this.MAX_CACHE_SIZE) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) {
        this.cache.delete(firstKey);
      }
    }

    this.cache.set(text, embedding);
  }

  /**
   * Clear the embedding cache
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { size: number; maxSize: number } {
    return {
      size: this.cache.size,
      maxSize: this.MAX_CACHE_SIZE,
    };
  }

  /**
   * Check if the model is initialized
   */
  isInitialized(): boolean {
    return this.extractor !== null;
  }
}

// Export singleton instance
export const embeddingService = new EmbeddingService();
