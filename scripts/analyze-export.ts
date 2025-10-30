import { readFile, writeFile } from 'fs/promises';
import path from 'path';

interface Passage {
  id: string;
  text: string;
  wordCount: number;
  position: number;
  quality: number;
}

interface PageRecord {
  id: string;
  url: string;
  title: string;
  content: string;
  passages: Passage[];
  timestamp: number;
  dwellTime?: number;
  lastAccessed?: number;
  visitCount?: number;
}

interface ExportPayload {
  exportedAt?: string;
  totalPages?: number;
  pages: PageRecord[];
}

function getDomain(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.hostname.replace(/^www\./, '');
  } catch {
    return 'invalid-url';
  }
}

function formatDate(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toISOString().split('T')[0];
}

async function main() {
  const exportPath = process.argv[2];
  if (!exportPath) {
    console.error('Usage: npx tsx scripts/analyze-export.ts <export-json-path> [sample-output.json]');
    process.exit(1);
  }

  const absolutePath = path.resolve(exportPath);
  console.log(`📂 Loading export from ${absolutePath}`);

  const raw = await readFile(absolutePath, 'utf8');
  const parsed: ExportPayload | PageRecord[] = JSON.parse(raw);
  const pages: PageRecord[] = Array.isArray(parsed) ? parsed : parsed.pages ?? [];

  if (pages.length === 0) {
    console.warn('No pages found in export.');
    return;
  }

  console.log(`🧾 Pages in export: ${pages.length}`);

  let minTimestamp = Number.POSITIVE_INFINITY;
  let maxTimestamp = Number.NEGATIVE_INFINITY;
  let totalPassages = 0;
  let totalWords = 0;

  const domainCounts = new Map<string, number>();
  const dailyCounts = new Map<string, number>();

  for (const page of pages) {
    const domain = getDomain(page.url);
    domainCounts.set(domain, (domainCounts.get(domain) ?? 0) + 1);

    if (typeof page.timestamp === 'number' && !Number.isNaN(page.timestamp)) {
      minTimestamp = Math.min(minTimestamp, page.timestamp);
      maxTimestamp = Math.max(maxTimestamp, page.timestamp);
      const dayKey = formatDate(page.timestamp);
      dailyCounts.set(dayKey, (dailyCounts.get(dayKey) ?? 0) + 1);
    }

    const passageCount = Array.isArray(page.passages) ? page.passages.length : 0;
    totalPassages += passageCount;

    if (Array.isArray(page.passages)) {
      for (const passage of page.passages) {
        totalWords += passage.wordCount ?? 0;
      }
    }
  }

  const sortedDomains = Array.from(domainCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20);

  const sortedDaily = Array.from(dailyCounts.entries())
    .sort((a, b) => a[0].localeCompare(b[0]));

  console.log('\n🌐 Top domains:');
  for (const [domain, count] of sortedDomains) {
    console.log(`  ${domain.padEnd(30)} ${count.toString().padStart(6)} pages`);
  }

  if (Number.isFinite(minTimestamp) && Number.isFinite(maxTimestamp)) {
    console.log('\n🗓️  Date range:');
    console.log(`  Start: ${new Date(minTimestamp).toISOString()}`);
    console.log(`  End  : ${new Date(maxTimestamp).toISOString()}`);
    console.log(`  Days captured: ${sortedDaily.length}`);
  }

  console.log('\n📄 Passage stats:');
  console.log(`  Total passages    : ${totalPassages}`);
  console.log(`  Avg passages/page : ${(totalPassages / pages.length).toFixed(2)}`);
  console.log(`  Avg passage words : ${totalPassages > 0 ? (totalWords / totalPassages).toFixed(1) : 'N/A'}`);

  // Sample 10 pages for manual review
  const sampleSize = Math.min(10, pages.length);
  const sample: PageRecord[] = [];
  const taken = new Set<number>();
  while (sample.length < sampleSize) {
    const idx = Math.floor(Math.random() * pages.length);
    if (taken.has(idx)) continue;
    sample.push(pages[idx]);
    taken.add(idx);
  }

  const samplePath = process.argv[3];
  if (samplePath) {
    const sampleAbsolute = path.resolve(samplePath);
    await writeFile(sampleAbsolute, JSON.stringify(sample, null, 2), 'utf8');
    console.log(`\n🎯 Wrote sample of ${sample.length} pages to ${sampleAbsolute}`);
  } else {
    console.log('\n🎯 Sample pages (use -- sample-output.json to write to disk):');
    for (const page of sample) {
      console.log(`  - ${page.title || '(untitled)'} — ${page.url}`);
    }
  }

  // Optionally emit daily distribution
  console.log('\n📆 Daily page counts (first 10 days):');
  for (const [day, count] of sortedDaily.slice(0, 10)) {
    console.log(`  ${day}: ${count}`);
  }
}

main().catch((error) => {
  console.error('Analysis failed:', error);
  process.exit(1);
});
