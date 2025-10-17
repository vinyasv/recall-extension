/**
 * URL normalization utilities
 */

/**
 * Normalize URL for comparison and deduplication
 * Removes query parameters, fragments, and trailing slashes
 * @param url URL to normalize
 * @returns Normalized URL
 */
export function normalizeUrl(url: string): string {
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
 * Check if two URLs are equivalent after normalization
 * @param url1 First URL
 * @param url2 Second URL
 * @returns True if URLs are equivalent
 */
export function areUrlsEquivalent(url1: string, url2: string): boolean {
  return normalizeUrl(url1) === normalizeUrl(url2);
}

/**
 * Extract the base URL (protocol + domain + path) from a full URL
 * @param url Full URL
 * @returns Base URL without query params and fragments
 */
export function getBaseUrl(url: string): string {
  try {
    const urlObj = new URL(url);
    return `${urlObj.protocol}//${urlObj.hostname}${urlObj.pathname}`;
  } catch {
    return url;
  }
}

/**
 * Check if a URL is likely to be a valid HTTP/HTTPS URL
 * @param url URL to validate
 * @returns True if likely valid HTTP/HTTPS URL
 */
export function isValidHttpUrl(url: string): boolean {
  try {
    const urlObj = new URL(url);
    return urlObj.protocol === 'http:' || urlObj.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Check if a URL is likely to be a main content page
 * Excludes common non-content patterns
 * @param url URL to check
 * @returns True if likely a content page
 */
export function isLikelyContentPage(url: string): string {
  try {
    const urlObj = new URL(url);
    const path = urlObj.pathname.toLowerCase();

    // Exclude common non-content patterns
    const excludePatterns = [
      '/admin',
      '/login',
      '/signup',
      '/register',
      '/account',
      '/settings',
      '/search',
      '/cart',
      '/checkout',
      '/api/',
      '/ajax/',
      '/static/',
      '/assets/',
      '.css',
      '.js',
      '.json',
      '.xml',
      '.rss',
      '.pdf',
      '.jpg',
      '.png',
      '.gif',
      '.svg',
    ];

    for (const pattern of excludePatterns) {
      if (path.includes(pattern)) {
        return 'false';
      }
    }

    return 'true';
  } catch {
    return 'false';
  }
}