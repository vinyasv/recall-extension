/**
 * IntentClassificationService - Hybrid intent classification using regex + LLM fallback
 * Combines fast pattern matching with semantic LLM understanding
 */

import { queryIntentClassifier } from './QueryIntentClassifier';
import { llmIntentClassifier } from './LLMIntentClassifier';
import { loggers } from '../utils/logger';
import type { QueryIntent } from './types';

export interface ClassificationOptions {
  confidenceThreshold?: number; // Threshold for regex confidence (default: 0.7)
  forceLLM?: boolean; // Force LLM classification regardless of regex confidence
  forceRegex?: boolean; // Force regex classification (skip LLM fallback)
}

export interface ClassificationResult extends QueryIntent {
  method: 'regex' | 'llm'; // Which classifier was used
  regexConfidence?: number; // Original regex confidence (for debugging)
  latency: number; // Classification latency in ms
}

/**
 * Hybrid intent classification service
 */
export class IntentClassificationService {
  private readonly DEFAULT_THRESHOLD = 0.7;
  private llmAvailable: boolean | null = null;
  private classificationStats = {
    regexUsed: 0,
    llmUsed: 0,
    llmFailed: 0,
    totalQueries: 0,
  };

  /**
   * Initialize the service
   */
  async initialize(): Promise<void> {
    loggers.ragController.debug('Initializing hybrid intent classification service...');

    // Check LLM availability
    try {
      this.llmAvailable = await llmIntentClassifier.isAvailable();
      loggers.ragController.debug('LLM classifier available:', this.llmAvailable);
    } catch (error) {
      loggers.ragController.debug('LLM classifier not available:', error);
      this.llmAvailable = false;
    }

    loggers.ragController.debug('Hybrid intent classification service initialized');
  }

  /**
   * Classify query intent using hybrid approach
   * @param query User query string
   * @param options Classification options
   * @returns Classification result with intent and metadata
   */
  async classify(query: string, options: ClassificationOptions = {}): Promise<ClassificationResult> {
    const startTime = Date.now();
    this.classificationStats.totalQueries++;

    const threshold = options.confidenceThreshold ?? this.DEFAULT_THRESHOLD;

    // Force LLM mode
    if (options.forceLLM && this.llmAvailable) {
      loggers.ragController.debug('Force LLM classification mode');
      return await this._classifyWithLLM(query, startTime);
    }

    // Force regex mode
    if (options.forceRegex) {
      loggers.ragController.debug('Force regex classification mode');
      return this._classifyWithRegex(query, startTime);
    }

    // Hybrid mode: Try regex first
    const regexResult = queryIntentClassifier.classifyQuery(query);
    const regexLatency = Date.now() - startTime;

    loggers.ragController.debug(
      `Regex classified as: ${regexResult.type} (confidence: ${regexResult.confidence.toFixed(2)}, latency: ${regexLatency}ms)`
    );

    // High confidence regex result - use it
    if (regexResult.confidence >= threshold) {
      this.classificationStats.regexUsed++;

      return {
        ...regexResult,
        method: 'regex',
        regexConfidence: regexResult.confidence,
        latency: regexLatency,
      };
    }

    // Low confidence - try LLM fallback if available
    if (this.llmAvailable) {
      loggers.ragController.debug(
        `Regex confidence (${regexResult.confidence.toFixed(2)}) below threshold (${threshold}), falling back to LLM`
      );

      try {
        return await this._classifyWithLLM(query, startTime, regexResult.confidence);
      } catch (error) {
        loggers.ragController.error('LLM classification failed, using regex result:', error);
        this.classificationStats.llmFailed++;

        // Fallback to regex result
        return {
          ...regexResult,
          method: 'regex',
          regexConfidence: regexResult.confidence,
          latency: Date.now() - startTime,
        };
      }
    }

    // LLM not available - use regex result
    loggers.ragController.debug('LLM not available, using regex result despite low confidence');
    this.classificationStats.regexUsed++;

    return {
      ...regexResult,
      method: 'regex',
      regexConfidence: regexResult.confidence,
      latency: Date.now() - startTime,
    };
  }

  /**
   * Classify using regex only
   */
  private _classifyWithRegex(query: string, startTime: number): ClassificationResult {
    const regexResult = queryIntentClassifier.classifyQuery(query);
    this.classificationStats.regexUsed++;

    return {
      ...regexResult,
      method: 'regex',
      regexConfidence: regexResult.confidence,
      latency: Date.now() - startTime,
    };
  }

  /**
   * Classify using LLM
   */
  private async _classifyWithLLM(
    query: string,
    startTime: number,
    regexConfidence?: number
  ): Promise<ClassificationResult> {
    const llmResult = await llmIntentClassifier.classifyQuery(query);
    this.classificationStats.llmUsed++;

    return {
      ...llmResult,
      method: 'llm',
      regexConfidence,
      latency: Date.now() - startTime,
    };
  }

  /**
   * Get intent-specific configuration
   */
  getIntentConfig(intentType: QueryIntent['type']) {
    return queryIntentClassifier.getIntentConfig(intentType);
  }

  /**
   * Check if LLM classifier is available
   */
  isLLMAvailable(): boolean {
    return this.llmAvailable === true;
  }

  /**
   * Get classification statistics
   */
  getStats() {
    return {
      ...this.classificationStats,
      llmAvailable: this.llmAvailable,
      regexPercentage: this.classificationStats.totalQueries > 0
        ? (this.classificationStats.regexUsed / this.classificationStats.totalQueries) * 100
        : 0,
      llmPercentage: this.classificationStats.totalQueries > 0
        ? (this.classificationStats.llmUsed / this.classificationStats.totalQueries) * 100
        : 0,
      llmFailureRate: this.classificationStats.llmUsed > 0
        ? (this.classificationStats.llmFailed / (this.classificationStats.llmUsed + this.classificationStats.llmFailed)) * 100
        : 0,
    };
  }

  /**
   * Reset statistics
   */
  resetStats(): void {
    this.classificationStats = {
      regexUsed: 0,
      llmUsed: 0,
      llmFailed: 0,
      totalQueries: 0,
    };
  }

  /**
   * Clear all caches
   */
  clearCaches(): void {
    llmIntentClassifier.clearCache();
    loggers.ragController.debug('Cleared intent classification caches');
  }
}

// Export singleton instance
export const intentClassificationService = new IntentClassificationService();
