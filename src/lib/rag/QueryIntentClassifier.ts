/**
 * QueryIntentClassifier - Pattern-based query intent detection
 * Classifies user queries to optimize retrieval and generation strategies
 */

import type { QueryIntent, IntentConfig } from './types';
import { loggers } from '../utils/logger';

/**
 * Query intent classifier using pattern matching
 */
export class QueryIntentClassifier {
  // Intent patterns for classification
  private readonly patterns = {
    factual: [
      /^what\s+(is|are|was|were)/i,
      /^who\s+(is|are|was|were)/i,
      /^when\s+(did|was|were|is)/i,
      /^where\s+(is|are|was|were)/i,
      /^define\s+/i,
      /^explain\s+/i,
      /^tell\s+me\s+about/i,
    ],
    comparison: [
      /\b(compare|comparison|versus|vs\.?|difference|differ)\b/i,
      /\b(better|worse|best|worst)\b.*\b(than|versus|vs\.?)\b/i,
      /\bwhich\s+is\s+(better|best|more)/i,
      /\b(pros?\s+and\s+cons?|advantages?\s+and\s+disadvantages?)\b/i,
    ],
    howto: [
      /^how\s+(to|do\s+i|can\s+i|does)/i,
      /\b(steps?\s+to|tutorial|guide|walkthrough)\b/i,
      /\b(setup|configure|install|implement)\b/i,
      /\bshow\s+me\s+how/i,
    ],
    navigation: [
      /\b(find|show\s+me)\s+(that|the)?\s*(page|site|website|article)/i,
      /\bwhere\s+did\s+i\s+(see|read|visit)/i,
      /\bthat\s+(page|site|website|article)\s+about/i,
      /\bwhich\s+(page|site|website)\b/i,
    ],
  };

  // Intent-specific configurations
  private readonly intentConfigs: Record<string, IntentConfig> = {
    factual: {
      topK: 5,
      minQuality: 0.6,
      diversityRequired: false,
      preferRecent: false,
    },
    comparison: {
      topK: 8,
      minQuality: 0.5,
      diversityRequired: true,
      preferRecent: false,
    },
    howto: {
      topK: 6,
      minQuality: 0.5,
      diversityRequired: false,
      preferRecent: true,
    },
    navigation: {
      topK: 10,
      minQuality: 0.3,
      diversityRequired: false,
      preferRecent: true,
    },
    general: {
      topK: 5,
      minQuality: 0.5,
      diversityRequired: false,
      preferRecent: false,
    },
  };

  /**
   * Classify a query into an intent category
   */
  classifyQuery(query: string): QueryIntent {
    return loggers.ragController.timed('intent-classification', () => {
      const normalizedQuery = query.trim();

      // Score each intent type
      const scores: Record<string, number> = {
        factual: 0,
        comparison: 0,
        howto: 0,
        navigation: 0,
      };

      // Check patterns for each intent
      for (const [intent, patterns] of Object.entries(this.patterns)) {
        for (const pattern of patterns) {
          if (pattern.test(normalizedQuery)) {
            scores[intent] += 1.0;
          }
        }
      }

      // Find highest scoring intent
      let maxScore = 0;
      let topIntent: QueryIntent['type'] = 'general';

      for (const [intent, score] of Object.entries(scores)) {
        if (score > maxScore) {
          maxScore = score;
          topIntent = intent as QueryIntent['type'];
        }
      }

      // Calculate confidence
      const totalScore = Object.values(scores).reduce((sum, s) => sum + s, 0);
      const confidence = totalScore > 0 ? maxScore / totalScore : 0.5;

      // Extract keywords (simple approach: remove stop words, take nouns/verbs)
      const keywords = this.extractKeywords(normalizedQuery);

      const result: QueryIntent = {
        type: topIntent,
        confidence,
        keywords,
      };

      loggers.ragController.debug(
        `Intent: ${result.type} (confidence: ${result.confidence.toFixed(2)})`
      );

      return result;
    });
  }

  /**
   * Get configuration for an intent type
   */
  getIntentConfig(intentType: QueryIntent['type']): IntentConfig {
    return this.intentConfigs[intentType] || this.intentConfigs.general;
  }

  /**
   * Extract keywords from query (simple approach)
   */
  private extractKeywords(query: string): string[] {
    // Common stop words
    const stopWords = new Set([
      'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from',
      'has', 'he', 'in', 'is', 'it', 'its', 'of', 'on', 'that', 'the',
      'to', 'was', 'will', 'with', 'how', 'what', 'when', 'where', 'who',
      'which', 'why', 'did', 'do', 'does', 'can', 'could', 'would', 'should',
      'i', 'me', 'my', 'you', 'your',
    ]);

    // Extract words
    const words = query
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ') // Remove punctuation
      .split(/\s+/)
      .filter((word) => word.length > 2 && !stopWords.has(word));

    // Remove duplicates and return
    return Array.from(new Set(words));
  }

  /**
   * Check if query is asking for comparison
   */
  isComparisonQuery(query: string): boolean {
    return this.classifyQuery(query).type === 'comparison';
  }

  /**
   * Check if query is asking for navigation
   */
  isNavigationQuery(query: string): boolean {
    return this.classifyQuery(query).type === 'navigation';
  }
}

// Export singleton instance
export const queryIntentClassifier = new QueryIntentClassifier();
