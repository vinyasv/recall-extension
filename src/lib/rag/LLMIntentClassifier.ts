/**
 * LLMIntentClassifier - Uses Chrome Prompt API for semantic query intent classification
 * Provides flexible, context-aware intent detection for complex queries
 */

import { offscreenManager } from '../../background/OffscreenManager';
import { loggers } from '../utils/logger';
import type { QueryIntent } from './types';

/**
 * LLM-based intent classifier using Chrome Prompt API
 */
export class LLMIntentClassifier {
  private isInitialized: boolean = false;
  private cache: Map<string, QueryIntent> = new Map();
  private readonly MAX_CACHE_SIZE = 200;

  /**
   * Initialize the classifier
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    loggers.ragController.debug('Initializing LLM intent classifier...');

    try {
      await offscreenManager.ensureOffscreenOpen();
      this.isInitialized = true;
      loggers.ragController.debug('LLM intent classifier initialized');
    } catch (error) {
      loggers.ragController.error('Failed to initialize LLM classifier:', error);
      throw error;
    }
  }

  /**
   * Check if LLM classifier is available
   */
  async isAvailable(): Promise<boolean> {
    try {
      if (!this.isInitialized) {
        await this.initialize();
      }

      const status = await offscreenManager.checkPromptApiAvailability();
      return status.available;
    } catch (error) {
      loggers.ragController.debug('LLM classifier not available:', error);
      return false;
    }
  }

  /**
   * Classify query intent using LLM
   */
  async classifyQuery(query: string): Promise<QueryIntent> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    // Check cache first
    const cached = this.cache.get(query);
    if (cached) {
      loggers.ragController.debug('LLM intent cache hit for query:', query);
      return cached;
    }

    loggers.ragController.debug('Classifying with LLM:', query);

    const prompt = this._buildClassificationPrompt(query);

    try {
      const response = await offscreenManager.prompt(prompt, {
        temperature: 0.1, // Low temperature for consistent classification
      });

      const intent = this._parseResponse(response, query);

      // Cache the result
      this._addToCache(query, intent);

      loggers.ragController.debug(
        `LLM classified as: ${intent.type} (confidence: ${intent.confidence.toFixed(2)})`
      );

      return intent;
    } catch (error) {
      loggers.ragController.error('LLM classification failed:', error);
      throw error;
    }
  }

  /**
   * Build classification prompt
   */
  private _buildClassificationPrompt(query: string): string {
    return `You are a query intent classifier for a browser history search system. Classify the user's query into ONE of these intent categories:

INTENT CATEGORIES:
1. factual - Queries asking for definitions, explanations, or factual information
   Examples: "What is machine learning?", "Who is the CEO of OpenAI?", "Explain quantum computing"

2. comparison - Queries comparing two or more things
   Examples: "React vs Vue", "Compare Python and JavaScript", "Difference between AI and ML"

3. howto - Queries asking for instructions, tutorials, or step-by-step guides
   Examples: "How to install Docker?", "Steps to deploy a website", "Tutorial for React hooks"

4. navigation - Queries trying to find a specific page or website they visited before
   Examples: "That article about climate change", "Find the recipe I saw yesterday", "The GitHub repo I bookmarked"

5. general - Queries that don't fit the above categories or are exploratory
   Examples: "machine learning applications", "latest tech trends", "interesting articles about space"

USER QUERY: "${query}"

Respond ONLY with a valid JSON object in this exact format (no markdown, no code blocks, no extra text):
{"type": "factual|comparison|howto|navigation|general", "confidence": 0.0-1.0, "keywords": ["keyword1", "keyword2"]}

Example responses:
{"type": "factual", "confidence": 0.95, "keywords": ["machine", "learning", "definition"]}
{"type": "comparison", "confidence": 0.88, "keywords": ["react", "vue", "frameworks"]}
{"type": "howto", "confidence": 0.92, "keywords": ["install", "docker", "setup"]}

JSON:`;
  }

  /**
   * Parse LLM response into QueryIntent
   */
  private _parseResponse(response: string, query: string): QueryIntent {
    try {
      // Clean up response - remove markdown code blocks if present
      let cleaned = response.trim();

      // Remove markdown code blocks
      cleaned = cleaned.replace(/```json\s*/g, '').replace(/```\s*/g, '');

      // Try to find JSON object in the response
      const jsonMatch = cleaned.match(/\{[^}]+\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }

      const parsed = JSON.parse(jsonMatch[0]);

      // Validate the response
      const validTypes = ['factual', 'comparison', 'howto', 'navigation', 'general'];
      if (!validTypes.includes(parsed.type)) {
        throw new Error(`Invalid intent type: ${parsed.type}`);
      }

      if (typeof parsed.confidence !== 'number' || parsed.confidence < 0 || parsed.confidence > 1) {
        throw new Error(`Invalid confidence: ${parsed.confidence}`);
      }

      // Extract keywords or use defaults
      const keywords = Array.isArray(parsed.keywords)
        ? parsed.keywords.filter((k: any) => typeof k === 'string')
        : this._extractSimpleKeywords(query);

      return {
        type: parsed.type,
        confidence: parsed.confidence,
        keywords,
      };
    } catch (error) {
      loggers.ragController.error('Failed to parse LLM response:', error);
      loggers.ragController.debug('Raw response:', response);

      // Fallback: return general intent with low confidence
      return {
        type: 'general',
        confidence: 0.3,
        keywords: this._extractSimpleKeywords(query),
      };
    }
  }

  /**
   * Simple keyword extraction fallback
   */
  private _extractSimpleKeywords(query: string): string[] {
    const stopWords = new Set([
      'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from',
      'has', 'he', 'in', 'is', 'it', 'its', 'of', 'on', 'that', 'the',
      'to', 'was', 'will', 'with', 'how', 'what', 'when', 'where', 'who',
    ]);

    return query
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter((word) => word.length > 2 && !stopWords.has(word))
      .slice(0, 5); // Take top 5 keywords
  }

  /**
   * Add to cache with LRU eviction
   */
  private _addToCache(query: string, intent: QueryIntent): void {
    if (this.cache.size >= this.MAX_CACHE_SIZE) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) {
        this.cache.delete(firstKey);
      }
    }

    this.cache.set(query, intent);
  }

  /**
   * Clear cache
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
}

// Export singleton instance
export const llmIntentClassifier = new LLMIntentClassifier();
