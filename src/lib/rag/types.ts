/**
 * RAG-specific type definitions
 */

import type { Passage } from '../storage/types';

/**
 * Passage with retrieval metadata
 */
export interface RetrievedPassage {
  passage: Passage;
  pageId: string;
  pageUrl: string;
  pageTitle: string;
  similarity: number;
  combinedScore: number; // (similarity * 0.7) + (quality * 0.3)
  timestamp: number;
  visitCount: number;
  lastAccessed: number;
  dwellTime: number;
}

/**
 * RAG retrieval options
 */
export interface RetrievalOptions {
  topK?: number;
  minSimilarity?: number;
  maxPassagesPerPage?: number;
  maxPagesPerDomain?: number;
  qualityWeight?: number; // Weight for quality score in ranking (0-1)
}

/**
 * Context assembly options
 */
export interface ContextOptions {
  maxLength?: number;
  includeQualityIndicators?: boolean;
  includeCitationInstructions?: boolean;
}
