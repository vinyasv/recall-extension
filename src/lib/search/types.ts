/**
 * Type definitions for vector search
 */

import type { PageRecord } from '../storage/types';

/**
 * Search mode type
 */
export type SearchMode = 'semantic' | 'keyword' | 'hybrid';

/**
 * Search result with similarity and relevance scoring
 */
export interface SearchResult {
  /** The matched page record */
  page: PageRecord;

  /** Cosine similarity score (0-1, higher is better) */
  similarity: number;

  /** Combined relevance score incorporating similarity, recency, and access frequency */
  relevanceScore: number;

  /** Raw keyword score (optional, for hybrid search) */
  keywordScore?: number;

  /** Matched keywords (optional, for keyword/hybrid search) */
  matchedTerms?: string[];

  /** Text snippet from the top matching passage (optional, semantic only) */
  topPassageSnippet?: string;

  /** Final Reciprocal Rank Fusion score (optional, hybrid search) */
  fusionScore?: number;

  /** Contribution per source list used during fusion (optional, hybrid search) */
  sourceScores?: Record<string, number>;

  /** Search mode that produced this result (optional) */
  searchMode?: SearchMode;

  /** Confidence level of this result (high/medium/low) */
  confidence?: 'high' | 'medium' | 'low';
}

/**
 * Keyword search result (internal use)
 */
export interface KeywordSearchResult {
  /** The matched page record */
  page: PageRecord;

  /** TF-IDF score */
  score: number;

  /** Terms that matched in the search */
  matchedTerms: string[];
}

/**
 * Options for configuring search behavior
 */
export interface SearchOptions {
  /** Number of top results to return (default: 10) */
  k?: number;

  /** Minimum similarity threshold (0-1, default: 0.3) */
  minSimilarity?: number;

  /** Boost recent pages in ranking (default: true) */
  boostRecent?: boolean;

  /** Boost frequently accessed pages in ranking (default: true) */
  boostFrequent?: boolean;

  /** Recency boost weight (0-1, default: 0.2) */
  recencyWeight?: number;

  /** Access frequency boost weight (0-1, default: 0.1) */
  frequencyWeight?: number;

  /** Search mode: 'semantic', 'keyword', or 'hybrid' (default: 'hybrid') */
  mode?: SearchMode;

  /** Alpha weight for semantic vs keyword (0-1, default: 0.5, only for hybrid mode) */
  alpha?: number;
}

/**
 * Internal ranking configuration
 */
export interface RankingConfig {
  baseWeight: number;      // Similarity weight
  recencyWeight: number;   // How much to boost recent pages
  frequencyWeight: number; // How much to boost frequently accessed pages
  recencyDecayDays: number; // Days for recency to decay to 0
}
