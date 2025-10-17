/**
 * Keyword Search - TF-IDF based keyword search
 */

import type { KeywordSearchResult } from './types';
import { vectorStore } from '../storage/VectorStore';
import { tokenize, isExactPhraseMatch, extractDomain } from '../utils/textProcessing';
import { TEXT_PROCESSING } from '../constants/contentSelectors';
import { loggers } from '../utils/logger';
import { globalCaches, cacheKeys } from '../utils/cache';

import { FIELD_WEIGHTS } from '../utils/textProcessing';

/**
 * Calculate term frequency for a term in a document
 */
function calculateTF(term: string, tokens: string[]): number {
  const count = tokens.filter(t => t === term).length;
  return tokens.length > 0 ? count / tokens.length : 0;
}

/**
 * Calculate inverse document frequency for a term
 */
function calculateIDF(term: string, allDocuments: string[][]): number {
  const docsWithTerm = allDocuments.filter(doc => doc.includes(term)).length;
  return docsWithTerm > 0 ? Math.log(allDocuments.length / docsWithTerm) : 0;
}

/**
 * Calculate TF-IDF score for a document
 */
function calculateTFIDF(
  queryTerms: string[],
  docTokens: { title: string[]; summary: string[]; url: string[]; content: string[] },
  idfScores: Map<string, number>
): number {
  let score = 0;

  for (const term of queryTerms) {
    const idf = idfScores.get(term) || 0;

    // Calculate weighted TF-IDF for each field
    const titleTF = calculateTF(term, docTokens.title);
    const summaryTF = calculateTF(term, docTokens.summary);
    const urlTF = calculateTF(term, docTokens.url);
    const contentTF = calculateTF(term, docTokens.content);

    score +=
      titleTF * idf * FIELD_WEIGHTS.title +
      summaryTF * idf * FIELD_WEIGHTS.summary +
      urlTF * idf * FIELD_WEIGHTS.url +
      contentTF * idf * FIELD_WEIGHTS.content;
  }

  return score;
}

/**
 * KeywordSearch class for TF-IDF based keyword search
 */
export class KeywordSearch {
  /**
   * Search for pages matching keywords
   * @param query Search query
   * @param options Search options
   * @returns Array of keyword search results sorted by score
   */
  async search(
    query: string,
    options: { k?: number; minScore?: number } = {}
  ): Promise<KeywordSearchResult[]> {
    return loggers.keywordSearch.timedAsync('keyword-search', async () => {
      const k = options.k || 10;
      const minScore = options.minScore || 0.01;
      const cacheKey = cacheKeys.keywordSearch(query, options);

      // Check cache first
      const cached = globalCaches.queryCache.get(cacheKey);
      if (cached) {
        loggers.keywordSearch.debug('Cache hit for keyword search');
        return cached;
      }

      loggers.keywordSearch.debug('Searching for:', query);

      // Tokenize query
      const queryTerms = tokenize(query);
      if (queryTerms.length === 0) {
        loggers.keywordSearch.debug('No valid query terms after tokenization');
        return [];
      }

      loggers.keywordSearch.debug('Query terms:', queryTerms);

      // Get all pages from database
      const pages = await vectorStore.getAllPages();
      if (pages.length === 0) {
        loggers.keywordSearch.debug('No pages in database');
        return [];
      }

      loggers.keywordSearch.debug('Searching across', pages.length, 'pages');

    // Tokenize all documents for IDF calculation
    const allDocuments: string[][] = [];
    const pageTokens: Map<string, { title: string[]; summary: string[]; url: string[]; content: string[] }> = new Map();

    for (const page of pages) {
      const titleTokens = tokenize(page.title);
      // Create passage tokens by joining all passage texts
      const passageTexts = page.passages?.map(p => p.text).join(' ') || '';
      const passageTokens = tokenize(passageTexts);
      const urlTokens = tokenize(page.url);
      const contentTokens = tokenize(page.content.substring(0, TEXT_PROCESSING.MAX_CONTENT_LENGTH));

      const allTokens = [...titleTokens, ...passageTokens, ...urlTokens, ...contentTokens];
      allDocuments.push(allTokens);

      pageTokens.set(page.id, {
        title: titleTokens,
        summary: passageTokens, // Keep field name for compatibility
        url: urlTokens,
        content: contentTokens,
      });
    }

    // Calculate IDF for each query term
    const idfScores = new Map<string, number>();
    for (const term of queryTerms) {
      idfScores.set(term, calculateIDF(term, allDocuments));
    }

    // Calculate TF-IDF scores for each page
    const results: KeywordSearchResult[] = [];

    for (const page of pages) {
      const tokens = pageTokens.get(page.id)!;

      // Calculate base TF-IDF score
      let score = calculateTFIDF(queryTerms, tokens, idfScores);

      // Skip if score is too low
      if (score < minScore) {
        continue;
      }

      // Bonus: Exact phrase match in title or passages (2x boost)
      const passageTexts = page.passages?.map(p => p.text).join(' ') || '';
      if (
        isExactPhraseMatch(query, page.title) ||
        isExactPhraseMatch(query, passageTexts)
      ) {
        score *= 2.0;
        loggers.keywordSearch.debug('Exact phrase match bonus for:', page.title);
      }

      // Bonus: Domain match (1.5x boost)
      const pageDomain = extractDomain(page.url);
      const queryLower = query.toLowerCase();
      if (pageDomain && pageDomain.toLowerCase().includes(queryLower)) {
        score *= 1.5;
        loggers.keywordSearch.debug('Domain match bonus for:', page.url);
      }

      // Find which terms matched
      const matchedTerms = queryTerms.filter(term => {
        return (
          tokens.title.includes(term) ||
          tokens.summary.includes(term) ||
          tokens.url.includes(term) ||
          tokens.content.includes(term)
        );
      });

      results.push({
        page,
        score,
        matchedTerms,
      });
    }

    // Sort by score (descending)
    results.sort((a, b) => b.score - a.score);

    // Return top-k results
    const topResults = results.slice(0, k);

    loggers.keywordSearch.debug('Found', results.length, 'matches, returning top', topResults.length);

      // Cache the result
      globalCaches.queryCache.set(cacheKey, topResults);

      return topResults;
    });
  }
}

// Export singleton instance
export const keywordSearch = new KeywordSearch();
