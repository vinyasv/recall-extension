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
  // Each pattern has a weight (default: 1.0) for confidence scoring
  private readonly patterns = {
    factual: [
      // Question words - high confidence
      { pattern: /^what\s+(is|are|was|were|does|do)/i, weight: 1.0 },
      { pattern: /^who\s+(is|are|was|were|made|created|invented)/i, weight: 1.0 },
      { pattern: /^when\s+(did|was|were|is|does)/i, weight: 1.0 },
      { pattern: /^where\s+(is|are|was|were|can\s+i)/i, weight: 1.0 },
      { pattern: /^why\s+(is|are|was|were|does|do)/i, weight: 1.0 },

      // Definition and explanation requests - high confidence
      { pattern: /^define\s+/i, weight: 1.0 },
      { pattern: /^explain\s+/i, weight: 1.0 },
      { pattern: /^describe\s+/i, weight: 1.0 },
      { pattern: /^tell\s+me\s+about/i, weight: 1.0 },
      { pattern: /\bwhat\s+does\s+.+\s+mean\b/i, weight: 0.9 },

      // Information seeking - medium confidence
      { pattern: /\b(definition|meaning|explanation)\s+of\b/i, weight: 0.8 },
      { pattern: /\binformation\s+(about|on)\b/i, weight: 0.7 },
      { pattern: /\bdetails\s+(about|on)\b/i, weight: 0.7 },
    ],
    comparison: [
      // Explicit comparison words - high confidence
      { pattern: /\b(compare|comparison|versus|vs\.?)\b/i, weight: 1.0 },
      { pattern: /\b(difference|differ|differentiate)\s+between\b/i, weight: 1.0 },
      { pattern: /\bwhich\s+is\s+(better|best|worse|worst|faster|slower)/i, weight: 1.0 },

      // Comparative forms - high confidence
      { pattern: /\b(better|worse|best|worst)\b.*\b(than|versus|vs\.?|compared\s+to)\b/i, weight: 0.9 },
      { pattern: /\b.+\s+(vs\.?|versus)\s+.+/i, weight: 0.95 },

      // Pros/cons and advantages - high confidence
      { pattern: /\b(pros?\s+and\s+cons?|advantages?\s+and\s+disadvantages?)\b/i, weight: 1.0 },
      { pattern: /\bpros?\s+of\b.*\bcons?\s+of\b/i, weight: 0.9 },

      // Which questions - medium confidence
      { pattern: /^which\s+(one|option|framework|language|tool)/i, weight: 0.8 },
      { pattern: /\bshould\s+i\s+(use|choose|pick)\b/i, weight: 0.7 },
    ],
    howto: [
      // How-to questions - high confidence
      { pattern: /^how\s+(to|do\s+i|can\s+i|does|should\s+i)/i, weight: 1.0 },
      { pattern: /\bshow\s+me\s+how(\s+to)?\b/i, weight: 1.0 },

      // Tutorial and guide keywords - high confidence
      { pattern: /\b(tutorial|guide|walkthrough|instructions?)\b/i, weight: 0.9 },
      { pattern: /\b(steps?\s+to|how\s+to\s+guide)\b/i, weight: 0.95 },

      // Action verbs - medium-high confidence
      { pattern: /\b(setup|configure|install|implement|deploy|create|build)\b/i, weight: 0.8 },
      { pattern: /\b(learn|get\s+started|beginner|start\s+with)\b/i, weight: 0.75 },

      // Process-oriented - medium confidence
      { pattern: /\bprocess\s+(of|for|to)\b/i, weight: 0.7 },
      { pattern: /\bway\s+to\b/i, weight: 0.6 },
    ],
    navigation: [
      // Explicit page finding - high confidence
      { pattern: /\b(find|show\s+me)\s+(that|the)?\s*(page|site|website|article|post|blog)\b/i, weight: 1.0 },
      { pattern: /\bwhere\s+(did\s+i|can\s+i\s+find)\s+(see|read|visit|find)/i, weight: 1.0 },
      { pattern: /\bthat\s+(page|site|website|article|post|video)\s+(about|on|regarding)/i, weight: 1.0 },

      // Temporal navigation - high confidence
      { pattern: /\b(yesterday|last\s+week|recently|earlier|before)\b.*\b(saw|read|visited)\b/i, weight: 0.95 },
      { pattern: /\bsaw.*\b(yesterday|recently|last\s+week|earlier)\b/i, weight: 0.95 },

      // Memory-based - medium-high confidence
      { pattern: /\b(remember|recall)\s+that\b/i, weight: 0.85 },
      { pattern: /\bwhich\s+(page|site|website|article)\b/i, weight: 0.8 },

      // Implicit navigation - medium confidence
      { pattern: /\bthat\s+.+\s+i\s+(saw|read|visited|bookmarked)\b/i, weight: 0.75 },
      { pattern: /\bgo\s+back\s+to\b/i, weight: 0.8 },
    ],
  };

  // Intent-specific configurations
  private readonly intentConfigs: Record<string, IntentConfig> = {
    factual: {
      topK: 3,
      minQuality: 0.6,
      diversityRequired: false,
      preferRecent: false,
      maxPassagesPerPage: 2,
      maxContextLength: 3000,
    },
    comparison: {
      topK: 4,
      minQuality: 0.5,
      diversityRequired: true,
      preferRecent: false,
      maxPassagesPerPage: 2,
      maxContextLength: 4000,
    },
    howto: {
      topK: 4,
      minQuality: 0.5,
      diversityRequired: false,
      preferRecent: true,
      maxPassagesPerPage: 2,
      maxContextLength: 3500,
    },
    navigation: {
      topK: 3,
      minQuality: 0.3,
      diversityRequired: false,
      preferRecent: true,
      maxPassagesPerPage: 1,
      maxContextLength: 2000,
    },
    general: {
      topK: 3,
      minQuality: 0.5,
      diversityRequired: false,
      preferRecent: false,
      maxPassagesPerPage: 2,
      maxContextLength: 3000,
    },
  };

  /**
   * Classify a query into an intent category
   */
  classifyQuery(query: string): QueryIntent {
    return loggers.ragController.timed('intent-classification', () => {
      const normalizedQuery = query.trim();

      // Score each intent type with weighted pattern matching
      const scores: Record<string, number> = {
        factual: 0,
        comparison: 0,
        howto: 0,
        navigation: 0,
      };

      // Check patterns for each intent
      for (const [intent, patterns] of Object.entries(this.patterns)) {
        for (const patternObj of patterns) {
          if (patternObj.pattern.test(normalizedQuery)) {
            scores[intent] += patternObj.weight;
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

      // Calculate confidence based on score distribution
      // High confidence when one intent dominates, low when scores are similar
      const totalScore = Object.values(scores).reduce((sum, s) => sum + s, 0);
      let confidence: number;

      if (totalScore === 0) {
        // No patterns matched - general intent with low confidence
        confidence = 0.3;
      } else {
        // Confidence is ratio of top score to total, adjusted by score magnitude
        const rawConfidence = maxScore / totalScore;

        // Boost confidence if maxScore is high (multiple strong patterns matched)
        const scoreBoost = Math.min(maxScore / 2.0, 1.0); // Max boost at score >= 2.0

        // Combined confidence: weighted average of ratio and boost
        confidence = Math.min(rawConfidence * 0.7 + scoreBoost * 0.3, 1.0);
      }

      // Extract keywords (simple approach: remove stop words, take nouns/verbs)
      const keywords = this.extractKeywords(normalizedQuery);

      const result: QueryIntent = {
        type: topIntent,
        confidence,
        keywords,
      };

      loggers.ragController.debug(
        `Regex intent: ${result.type} (confidence: ${result.confidence.toFixed(2)}, score: ${maxScore.toFixed(2)})`
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
