/**
 * Shared text processing utilities
 */

/**
 * Common stop words for keyword search
 */
export const STOP_WORDS = new Set([
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
export const FIELD_WEIGHTS = {
  title: 3.0,
  summary: 2.0,
  url: 1.5,
  content: 1.0,
} as const;

/**
 * Tokenize text into searchable terms
 * @param text Text to tokenize
 * @returns Array of normalized tokens
 */
export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s\.]/g, ' ') // Replace non-alphanumeric with spaces, preserve dots for tokens like react.useeffect
    .split(/\s+/)
    .filter(term => term.length >= 3) // Filter short terms
    .filter(term => !STOP_WORDS.has(term)); // Filter stop words
}

/**
 * Clean and normalize text content
 * @param text Raw text content
 * @param maxLength Maximum length to keep (default: 10000)
 * @returns Cleaned text
 */
export function cleanText(text: string, maxLength: number = 10000): string {
  return text
    // Normalize whitespace
    .replace(/\s+/g, ' ')
    // Normalize newlines
    .replace(/\n+/g, '\n')
    // Remove excessive spaces around newlines
    .replace(/ *\n */g, '\n')
    // Trim
    .trim()
    // Limit length
    .substring(0, maxLength);
}

/**
 * Extract domain from URL
 * @param url URL to extract domain from
 * @returns Domain name (without www) or empty string
 */
export function extractDomain(url: string): string {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname.replace('www.', '');
  } catch {
    return '';
  }
}

/**
 * Check if query is an exact phrase match in text
 * @param query Search query
 * @param text Text to search in
 * @returns True if exact phrase match found
 */
export function isExactPhraseMatch(query: string, text: string): boolean {
  const normalizedQuery = query.toLowerCase().trim();
  const normalizedText = text.toLowerCase();
  if (normalizedQuery.startsWith('"') && normalizedQuery.endsWith('"')) {
    return normalizedText.includes(normalizedQuery.slice(1, -1));
  }
  return normalizedText.includes(normalizedQuery);
}

/**
 * Calculate word count for text
 * @param text Text to count words in
 * @returns Number of words
 */
export function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(word => word.length > 0).length;
}

/**
 * Check if text meets minimum requirements
 * @param text Text to check
 * @param minChars Minimum character count (default: 200)
 * @param minWords Minimum word count (default: 10)
 * @returns True if text meets requirements
 */
export function meetsMinimumRequirements(
  text: string,
  minChars: number = 200,
  minWords: number = 10
): boolean {
  const trimmed = text.trim();
  return trimmed.length >= minChars && wordCount(trimmed) >= minWords;
}

/**
 * Truncate text to specified word count
 * @param text Text to truncate
 * @param maxWords Maximum words to keep
 * @returns Truncated text
 */
export function truncateToWordCount(text: string, maxWords: number): string {
  const words = text.split(/\s+/);
  if (words.length <= maxWords) {
    return text;
  }
  return words.slice(0, maxWords).join(' ');
}