/**
 * Keyword Search - TF-IDF based keyword search
 */

import type { KeywordSearchResult } from './types';
import { vectorStore } from '../storage/VectorStore';

/**
 * Common stop words to filter out
 */
const STOP_WORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
  'of', 'with', 'by', 'from', 'as', 'is', 'was', 'are', 'were', 'been',
  'be', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
  'should', 'may', 'might', 'can', 'this', 'that', 'these', 'those', 'it',
  'its', 'if', 'then', 'than', 'so', 'just', 'about', 'into', 'through',
  'during', 'before', 'after', 'above', 'below', 'between', 'under', 'over',
  'not', 'no', 'yes', 'all', 'any', 'both', 'each', 'few', 'more', 'most',
  'some', 'such', 'only', 'own', 'same', 'other', 'also', 'when', 'where',
  'who', 'which', 'what', 'how', 'why', 'there', 'here', 'out', 'up', 'down',
]);

/**
 * Field weights for TF-IDF scoring
 */
const FIELD_WEIGHTS = {
  title: 3.0,
  summary: 2.0,
  url: 1.5,
  content: 1.0,
};

/**
 * Maximum content length to scan (for performance)
 */
const MAX_CONTENT_LENGTH = 2000;

/**
 * Tokenize text into terms
 */
function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ') // Replace non-alphanumeric with spaces
    .split(/\s+/)
    .filter(term => term.length >= 3) // Filter short terms
    .filter(term => !STOP_WORDS.has(term)); // Filter stop words
}

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
 * Check if query is an exact phrase match in text
 */
function isExactPhraseMatch(query: string, text: string): boolean {
  const normalizedQuery = query.toLowerCase().trim();
  const normalizedText = text.toLowerCase();
  return normalizedText.includes(normalizedQuery);
}

/**
 * Extract domain from URL
 */
function extractDomain(url: string): string {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname.replace('www.', '');
  } catch {
    return '';
  }
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
    const k = options.k || 10;
    const minScore = options.minScore || 0.01;

    console.log('[KeywordSearch] Searching for:', query);

    // Tokenize query
    const queryTerms = tokenize(query);
    if (queryTerms.length === 0) {
      console.log('[KeywordSearch] No valid query terms after tokenization');
      return [];
    }

    console.log('[KeywordSearch] Query terms:', queryTerms);

    // Get all pages from database
    const pages = await vectorStore.getAllPages();
    if (pages.length === 0) {
      console.log('[KeywordSearch] No pages in database');
      return [];
    }

    console.log('[KeywordSearch] Searching across', pages.length, 'pages');

    // Tokenize all documents for IDF calculation
    const allDocuments: string[][] = [];
    const pageTokens: Map<string, { title: string[]; summary: string[]; url: string[]; content: string[] }> = new Map();

    for (const page of pages) {
      const titleTokens = tokenize(page.title);
      const summaryTokens = tokenize(page.summary);
      const urlTokens = tokenize(page.url);
      const contentTokens = tokenize(page.content.substring(0, MAX_CONTENT_LENGTH));

      const allTokens = [...titleTokens, ...summaryTokens, ...urlTokens, ...contentTokens];
      allDocuments.push(allTokens);

      pageTokens.set(page.id, {
        title: titleTokens,
        summary: summaryTokens,
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

      // Bonus: Exact phrase match in title or summary (2x boost)
      if (
        isExactPhraseMatch(query, page.title) ||
        isExactPhraseMatch(query, page.summary)
      ) {
        score *= 2.0;
        console.log('[KeywordSearch] Exact phrase match bonus for:', page.title);
      }

      // Bonus: Domain match (1.5x boost)
      const pageDomain = extractDomain(page.url);
      const queryLower = query.toLowerCase();
      if (pageDomain && queryLower.includes(pageDomain)) {
        score *= 1.5;
        console.log('[KeywordSearch] Domain match bonus for:', page.url);
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

    console.log('[KeywordSearch] Found', results.length, 'matches, returning top', topResults.length);

    return topResults;
  }
}

// Export singleton instance
export const keywordSearch = new KeywordSearch();
