/**
 * PassageRetriever - Passage-level semantic search for RAG
 * Searches passages directly instead of pages for better granularity
 */

import { embeddingGemmaService } from '../embeddings/EmbeddingGemmaService';
import { dotProduct } from '../search/VectorSearch';
import { vectorStore } from '../storage/VectorStore';
import type { RetrievedPassage, RetrievalOptions } from './types';
import type { PageRecord, Passage } from '../storage/types';
import { loggers } from '../utils/logger';

/**
 * PassageRetriever class
 */
export class PassageRetriever {
  private readonly DEFAULT_OPTIONS: Required<RetrievalOptions> = {
    topK: 10,
    minSimilarity: 0.58,
    maxPassagesPerPage: 3,
    maxPagesPerDomain: 2,
    qualityWeight: 0.3,
  };

  /**
   * Retrieve relevant passages for a query
   */
  async retrieve(query: string, options: RetrievalOptions = {}): Promise<RetrievedPassage[]> {
    return loggers.ragController.timedAsync('passage-retrieval', async () => {
      const opts = { ...this.DEFAULT_OPTIONS, ...options };

      loggers.ragController.debug('Retrieving passages with options:', opts);

      // Step 1: Generate query embedding (use 'query' task type for RAG)
      const queryEmbedding = await embeddingGemmaService.generateEmbedding(query, 'query');

      // Step 2: Get all pages from database
      const allPages = await vectorStore.getAllPages();

      if (allPages.length === 0) {
        loggers.ragController.warn('No pages in database');
        return [];
      }

      loggers.ragController.debug(`Searching across ${allPages.length} pages`);

      // Step 3: Extract all passages with embeddings from all pages
      const passageCandidates: Array<{
        passage: Passage;
        page: PageRecord;
        similarity: number;
        combinedScore: number;
      }> = [];

      for (const page of allPages) {
        if (!page.passages || page.passages.length === 0) {
          continue;
        }

        for (const passage of page.passages) {
          // Check if passage has embedding
          if (!passage.embedding) {
            continue;
          }

          // Calculate similarity using dot product (for normalized embeddings)
          const similarity = dotProduct(queryEmbedding, passage.embedding);

          // Filter by minimum similarity
          if (similarity < opts.minSimilarity) {
            continue;
          }

          // Calculate combined score: weighted combination of similarity and quality
          const combinedScore =
            similarity * (1 - opts.qualityWeight) + passage.quality * opts.qualityWeight;

          passageCandidates.push({
            passage,
            page,
            similarity,
            combinedScore,
          });
        }
      }

      loggers.ragController.debug(`Found ${passageCandidates.length} candidate passages`);

      if (passageCandidates.length === 0) {
        return [];
      }

      // Step 4: Sort by combined score (descending)
      passageCandidates.sort((a, b) => b.combinedScore - a.combinedScore);

      // Step 5: Apply diversity constraints
      const selectedPassages = this.applyDiversityConstraints(
        passageCandidates,
        opts.topK,
        opts.maxPassagesPerPage,
        opts.maxPagesPerDomain
      );

      // Step 6: Convert to RetrievedPassage format
      const results: RetrievedPassage[] = selectedPassages.map((candidate) => ({
        passage: candidate.passage,
        pageId: candidate.page.id,
        pageUrl: candidate.page.url,
        pageTitle: candidate.page.title,
        similarity: candidate.similarity,
        combinedScore: candidate.combinedScore,
        timestamp: candidate.page.timestamp,
        visitCount: candidate.page.visitCount,
        lastAccessed: candidate.page.lastAccessed,
        dwellTime: candidate.page.dwellTime,
      }));

      loggers.ragController.debug(`Selected ${results.length} passages after diversity filtering`);

      return results;
    });
  }

  /**
   * Apply diversity constraints to ensure varied sources
   */
  private applyDiversityConstraints(
    candidates: Array<{
      passage: Passage;
      page: PageRecord;
      similarity: number;
      combinedScore: number;
    }>,
    topK: number,
    maxPassagesPerPage: number,
    maxPagesPerDomain: number
  ): Array<{
    passage: Passage;
    page: PageRecord;
    similarity: number;
    combinedScore: number;
  }> {
    const selected: typeof candidates = [];
    const passagesPerPage = new Map<string, number>();
    const pagesPerDomain = new Map<string, number>();

    for (const candidate of candidates) {
      if (selected.length >= topK) {
        break;
      }

      const pageId = candidate.page.id;
      const domain = this.extractDomain(candidate.page.url);

      // Check per-page limit
      const currentPageCount = passagesPerPage.get(pageId) || 0;
      if (currentPageCount >= maxPassagesPerPage) {
        continue;
      }

      // Check per-domain limit
      const currentDomainCount = pagesPerDomain.get(domain) || 0;
      if (currentDomainCount >= maxPagesPerDomain) {
        continue;
      }

      // Add to selected
      selected.push(candidate);
      passagesPerPage.set(pageId, currentPageCount + 1);
      pagesPerDomain.set(domain, currentDomainCount + 1);
    }

    return selected;
  }

  /**
   * Extract domain from URL
   */
  private extractDomain(url: string): string {
    try {
      const urlObj = new URL(url);
      return urlObj.hostname.replace(/^www\./, '');
    } catch {
      return url;
    }
  }


  /**
   * Group passages by source page
   */
  groupByPage(passages: RetrievedPassage[]): Map<string, RetrievedPassage[]> {
    const grouped = new Map<string, RetrievedPassage[]>();

    for (const passage of passages) {
      const pageId = passage.pageId;
      if (!grouped.has(pageId)) {
        grouped.set(pageId, []);
      }
      grouped.get(pageId)!.push(passage);
    }

    return grouped;
  }

  /**
   * Get unique source pages from passages
   */
  getUniqueSources(passages: RetrievedPassage[]): Array<{
    pageId: string;
    pageUrl: string;
    pageTitle: string;
    passageCount: number;
  }> {
    const sourceMap = new Map<
      string,
      {
        pageId: string;
        pageUrl: string;
        pageTitle: string;
        passageCount: number;
      }
    >();

    for (const passage of passages) {
      if (!sourceMap.has(passage.pageId)) {
        sourceMap.set(passage.pageId, {
          pageId: passage.pageId,
          pageUrl: passage.pageUrl,
          pageTitle: passage.pageTitle,
          passageCount: 0,
        });
      }
      sourceMap.get(passage.pageId)!.passageCount++;
    }

    return Array.from(sourceMap.values());
  }
}

// Export singleton instance
export const passageRetriever = new PassageRetriever();
