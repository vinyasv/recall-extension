/**
 * Hybrid Test Query (production harness)
 * - Runs HybridSearch using production modules
 * - Monkey-patches VectorStore methods to use in-memory pages (Node-safe)
 */

import { embeddingService } from '../src/lib/embeddings/EmbeddingService';
import { hybridSearch } from '../src/lib/search/HybridSearch';
import { vectorStore } from '../src/lib/storage/VectorStore';
import type { PageRecord, PageMetadata, Passage } from '../src/lib/storage/types';

async function main() {
  const query = process.argv[2] || 'React.useEffect';
  console.log(`[Hybrid Test] Query: ${query}`);

  // Initialize embedding service (runs in Node with CPU backend)
  await embeddingService.initialize();

  // Seed in-memory pages
  const pages: PageRecord[] = [];

  async function seedPage({ url, title, content, summary }: { url: string; title: string; content: string; summary: string; }) {
    const summaryPassage: Passage = {
      id: `p${pages.length + 1}-1`,
      text: summary,
      wordCount: summary.split(/\s+/).length,
      position: 0,
      quality: 0.9,
      embedding: await embeddingService.generateEmbedding(summary),
    };
    const contentSnippet = content.slice(0, 200);
    const contentPassage: Passage = {
      id: `p${pages.length + 1}-2`,
      text: contentSnippet,
      wordCount: contentSnippet.split(/\s+/).length,
      position: 1,
      quality: 0.8,
      embedding: await embeddingService.generateEmbedding(contentSnippet),
    };
    const passages = [summaryPassage, contentPassage];
    const embedding = await embeddingService.generateEmbedding(`${title}. ${summary} ${content.slice(0, 300)}`);
    const page: PageRecord = {
      id: `${pages.length + 1}`,
      url,
      title,
      content,
      summary,
      passages,
      embedding,
      timestamp: Date.now() - (pages.length * 1000),
      dwellTime: 60,
      lastAccessed: 0,
    };
    pages.push(page);
  }

  // Example pages (cover brand/domain and dotted technical tokens)
  await seedPage({
    url: 'https://react.dev/reference/react/useEffect',
    title: 'React.useEffect Hook Guide',
    content: 'React.useEffect is a React hook for side effects. Learn how React.useEffect works with dependencies.',
    summary: 'Overview of React.useEffect and best practices.'
  });

  await seedPage({
    url: 'https://github.com/features',
    title: 'GitHub Features for Developers',
    content: 'GitHub.com offers repositories, issues, and pull requests. The domain github.com is popular for open source.',
    summary: 'GitHub capabilities and workflows.'
  });

  await seedPage({
    url: 'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Functions',
    title: 'JavaScript Functions Reference',
    content: 'Functions are fundamental building blocks in JavaScript. Learn about function declarations and expressions.',
    summary: 'JS function basics and patterns.'
  });

  // Monkey-patch VectorStore methods to use in-memory data
  (vectorStore as any).getAllPages = async (): Promise<PageRecord[]> => pages;
  (vectorStore as any).getAllPageMetadata = async (): Promise<PageMetadata[]> => {
    return pages.map(p => ({
      id: p.id,
      url: p.url,
      title: p.title,
      embedding: p.embedding,
      timestamp: p.timestamp,
      dwellTime: p.dwellTime,
      lastAccessed: p.lastAccessed,
    }));
  };
  (vectorStore as any).getPage = async (id: string): Promise<PageRecord | null> => {
    return pages.find(p => p.id === id) || null;
  };

  // Run hybrid search
  const results = await hybridSearch.search(query, { mode: 'hybrid', k: 10 });

  console.log(`\n[Hybrid Test] Top ${results.length} results:`);
  for (const r of results) {
    const domain = new URL(r.page.url).hostname;
    console.log(`- ${r.page.title} (${domain})`);
    console.log(`  similarity=${r.similarity.toFixed(3)}, rrfScore=${r.relevanceScore.toFixed(3)}, keywordScore=${(r.keywordScore ?? 0).toFixed(3)}`);
    if (r.matchedTerms?.length) {
      console.log(`  matchedTerms=${r.matchedTerms.join(', ')}`);
    }
  }
}

main().catch((err) => {
  console.error('[Hybrid Test] Error:', err);
  process.exit(1);
});