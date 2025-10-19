# Recall - Architecture & Technical Overview

## Table of Contents

- [Project Overview](#project-overview)
- [Core Architecture](#core-architecture)
- [Data Flow](#data-flow)
- [Component Details](#component-details)
- [Search Architecture](#search-architecture)
- [ML & AI Integration](#ml--ai-integration)
- [Storage Layer](#storage-layer)
- [Performance Optimizations](#performance-optimizations)
- [Extension Lifecycle](#extension-lifecycle)
- [Security & Privacy](#security--privacy)

---

## Project Overview

**Recall** is a privacy-first Chrome Extension (Manifest V3) that provides intelligent hybrid search over browser history. All processing happens locally on-device using Chrome's built-in AI capabilities and WebAssembly-based machine learning.

### Key Features

- **Hybrid Search**: Combines semantic understanding with keyword precision using Reciprocal Rank Fusion (RRF)
- **Passage-Based Chunking**: Chrome-inspired document segmentation for better search granularity
- **On-Device ML**: 384-dimensional embeddings via Transformers.js + WebAssembly
- **Local Summarization**: Chrome Summarizer API (Gemini Nano) with fallback
- **Zero Server Communication**: Complete privacy - no data leaves your device
- **Smart Indexing**: Dwell time tracking and intelligent queue management

### Technology Stack

- **Runtime**: Chrome Extension Manifest V3 (Service Worker)
- **Language**: TypeScript (ES2022, strict mode)
- **Build Tool**: Vite with multi-entry configuration
- **ML Framework**: Transformers.js (Hugging Face) with WASM backend
- **Embedding Model**: all-MiniLM-L6-v2 (384 dimensions)
- **Summarization**: Chrome Summarizer API (Gemini Nano)
- **Storage**: IndexedDB (via VectorStore abstraction)
- **Search**: Custom hybrid engine (semantic + TF-IDF + RRF)

---

## Core Architecture

### System Overview

```
┌─────────────────────────────────────────────────────────────┐
│                        Chrome Browser                        │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌────────────┐    ┌──────────────┐    ┌───────────────┐   │
│  │  Content   │    │   Offscreen  │    │   Service     │   │
│  │  Scripts   │◄───┤   Document   │◄───┤   Worker      │   │
│  └────────────┘    └──────────────┘    │  (Background) │   │
│        │                   │            └───────┬───────┘   │
│        │                   │                    │           │
│        ▼                   ▼                    ▼           │
│  ┌─────────────────────────────────────────────────────┐   │
│  │              Shared Libraries (lib/)                 │   │
│  │  ┌──────────┐ ┌──────────┐ ┌────────┐ ┌──────────┐ │   │
│  │  │Embedding │ │Summarizer│ │ Hybrid │ │  Vector  │ │   │
│  │  │ Service  │ │ Service  │ │ Search │ │  Store   │ │   │
│  │  └──────────┘ └──────────┘ └────────┘ └──────────┘ │   │
│  └─────────────────────────────────────────────────────┘   │
│                            ▼                                │
│                    ┌──────────────┐                         │
│                    │  IndexedDB   │                         │
│                    └──────────────┘                         │
└─────────────────────────────────────────────────────────────┘
```

### Directory Structure

```
src/
├── background/              # Service worker and orchestration
│   ├── index.ts            # Main entry point, message handlers
│   ├── TabMonitor.ts       # Tab tracking, dwell time calculation
│   ├── IndexingQueue.ts    # In-memory queue with retry logic
│   ├── IndexingPipeline.ts # 4-stage indexing orchestrator
│   └── OffscreenManager.ts # Chrome AI API access manager
│
├── content/                 # Content scripts (injected into pages)
│   ├── index.ts            # Content script entry point
│   ├── ContentExtractor.ts # DOM content extraction
│   ├── DocumentChunker.ts  # Passage-based chunking
│   └── sidebar.ts          # Search sidebar UI
│
├── offscreen/              # Offscreen document for Chrome AI
│   ├── summarizer.html     # Offscreen document HTML
│   └── summarizer.ts       # Summarizer API handler
│
├── lib/                    # Core libraries (singletons)
│   ├── embeddings/         # Embedding generation
│   │   └── EmbeddingService.ts
│   ├── summarizer/         # Text summarization
│   │   └── SummarizerService.ts
│   ├── storage/            # Data persistence
│   │   ├── VectorStore.ts
│   │   └── types.ts
│   ├── search/             # Search engines
│   │   ├── HybridSearch.ts
│   │   ├── VectorSearch.ts
│   │   ├── KeywordSearch.ts
│   │   └── types.ts
│   ├── config/             # Centralized configuration
│   │   └── searchConfig.ts
│   ├── constants/          # Constants and selectors
│   │   └── contentSelectors.ts
│   └── utils/              # Utilities
│       ├── logger.ts
│       ├── cache.ts
│       ├── textProcessing.ts
│       └── urlNormalization.ts
│
├── ui/                     # User interfaces
│   ├── popup.html/ts       # Extension popup (stats)
│   └── search.html/ts      # Search interface
│
└── utils/                  # Shared utilities
    └── uuid.ts
```

---

## Data Flow

### Indexing Pipeline Flow

```
┌──────────────┐
│ User visits  │
│ web page     │
└──────┬───────┘
       │
       ▼
┌──────────────────────────────────────────────────────────┐
│ Phase 1: Tab Monitoring (TabMonitor)                     │
│ - Track navigation events (onCommitted, onCompleted)     │
│ - Calculate dwell time (time spent on page)             │
│ - Trigger indexing when criteria met                     │
└──────┬───────────────────────────────────────────────────┘
       │
       ▼
┌──────────────────────────────────────────────────────────┐
│ Phase 2: Queue Management (IndexingQueue)                │
│ - Add page to in-memory queue                            │
│ - Track processing state (pending/processing/failed)     │
│ - Implement retry logic (max 3 attempts)                 │
└──────┬───────────────────────────────────────────────────┘
       │
       ▼
┌──────────────────────────────────────────────────────────┐
│ Phase 3: Orchestration (IndexingPipeline)                │
│                                                           │
│  Stage 1: Content Extraction                             │
│  ├─ Inject content script into tab                       │
│  ├─ Extract DOM content (ContentExtractor)               │
│  ├─ Generate passages (DocumentChunker)                  │
│  └─ Validate URL consistency                             │
│                                                           │
│  Stage 2: Summarization                                  │
│  ├─ Send text to OffscreenManager                        │
│  ├─ Offscreen doc uses Chrome Summarizer API             │
│  ├─ Generate concise summary (or fallback to truncate)   │
│  └─ Return summary to pipeline                           │
│                                                           │
│  Stage 3: Embedding Generation                           │
│  ├─ Send summary to EmbeddingService                     │
│  ├─ Load all-MiniLM-L6-v2 model (cached)                │
│  ├─ Generate 384-dim Float32Array embedding              │
│  └─ Cache result in LRU cache                            │
│                                                           │
│  Stage 4: Storage                                        │
│  ├─ Serialize embedding (Float32Array → ArrayBuffer)     │
│  ├─ Store PageRecord with passages in IndexedDB          │
│  └─ Update search indexes                                │
└──────┬───────────────────────────────────────────────────┘
       │
       ▼
┌──────────────────┐
│ Indexed and      │
│ searchable       │
└──────────────────┘
```

### Search Query Flow

```
┌──────────────┐
│ User enters  │
│ search query │
└──────┬───────┘
       │
       ▼
┌──────────────────────────────────────────────────────────┐
│ HybridSearch (default mode)                              │
│                                                           │
│  ┌─────────────────────┐    ┌──────────────────────┐    │
│  │ Semantic Search     │    │ Keyword Search       │    │
│  ├─────────────────────┤    ├──────────────────────┤    │
│  │ 1. Embed query      │    │ 1. Tokenize query    │    │
│  │ 2. Cosine similarity│    │ 2. TF-IDF scoring    │    │
│  │ 3. Rank by score    │    │ 3. Field weighting   │    │
│  │ 4. Top 20 results   │    │ 4. Top 20 results    │    │
│  └─────────┬───────────┘    └──────────┬───────────┘    │
│            │                           │                 │
│            └───────────┬───────────────┘                 │
│                        ▼                                 │
│            ┌───────────────────────┐                     │
│            │ Reciprocal Rank       │                     │
│            │ Fusion (RRF)          │                     │
│            │ - K = 60              │                     │
│            │ - Combine rankings    │                     │
│            │ - Enrich metadata     │                     │
│            └───────────┬───────────┘                     │
└────────────────────────┼─────────────────────────────────┘
                         │
                         ▼
                  ┌──────────────┐
                  │ Top 10       │
                  │ ranked       │
                  │ results      │
                  └──────────────┘
```

---

## Component Details

### Service Worker (background/index.ts)

**Role**: Central orchestrator and message handler

**Key Responsibilities**:
- Lifecycle management (onInstalled, onStartup)
- Lazy initialization of Phase 3 components
- Message routing to appropriate handlers
- Keepalive ping (every 20s) to prevent termination
- Queue processing loop (every 500ms)

**Initialization Flow**:
```typescript
// Phase 1: Immediate
chrome.runtime.onInstalled / onStartup

// Phase 2: On first message
Initialize message handlers

// Phase 3: Lazy (on demand)
TabMonitor → IndexingQueue → IndexingPipeline → VectorStore
```

**Message Handlers**:
```typescript
SEARCH_QUERY          → HybridSearch.search()
GET_DB_STATS          → VectorStore.getStats()
GET_ALL_PAGES         → VectorStore.getAllPages()
CLEAR_HISTORY         → VectorStore.clear()
PAUSE_INDEXING        → IndexingQueue.pause()
RESUME_INDEXING       → IndexingQueue.resume()
GET_QUEUE_STATUS      → IndexingQueue.getStatus()
```

### TabMonitor (background/TabMonitor.ts)

**Role**: Track user navigation and dwell time

**Key Features**:
- Monitors `webNavigation.onCommitted` and `webNavigation.onCompleted`
- Calculates dwell time (time between page load and navigation away)
- Filters out non-indexable URLs (chrome://, extensions, etc.)
- Triggers callback when page meets indexing criteria

**Configuration**:
```typescript
// From TabMonitor.ts
MIN_DWELL_TIME = 5000ms  // Minimum time to trigger indexing
```

### IndexingQueue (background/IndexingQueue.ts)

**Role**: Manage pages waiting to be indexed

**Features**:
- In-memory queue with processing state tracking
- Retry logic (max 3 attempts, exponential backoff)
- Pause/resume functionality
- Status reporting

**Queue Item States**:
```typescript
'pending'      // Waiting to be processed
'processing'   // Currently being indexed
'failed'       // Failed after max retries
```

**API**:
```typescript
add(item: QueueItem): void
getNext(): QueueItem | null
markComplete(url: string): void
markFailed(url: string, error: string): void
pause(): void
resume(): void
getStatus(): QueueStatus
```

### IndexingPipeline (background/IndexingPipeline.ts)

**Role**: Orchestrate 4-stage indexing workflow

**Stage 1: Content Extraction**
```typescript
// Inject content script
chrome.scripting.executeScript()

// Send extraction request
chrome.tabs.sendMessage(tabId, { type: 'EXTRACT_CONTENT' })

// Receive: { title, content, url, passages[] }
```

**Stage 2: Summarization**
```typescript
// Send to offscreen manager
const summary = await offscreenManager.summarize(content)

// Fallback: truncate to 200 chars if API unavailable
```

**Stage 3: Embedding Generation**
```typescript
// Generate embedding for summary
const embedding = await embeddingService.generateEmbedding(summary)

// Returns: Float32Array(384)
```

**Stage 4: Storage**
```typescript
// Create PageRecord
const record: PageRecord = {
  id: uuid(),
  url, title, content, summary,
  embedding,
  passages: Passage[],
  timestamp: Date.now(),
  dwellTime, lastAccessed
}

// Store in IndexedDB
await vectorStore.addPage(record)
```

**Race Condition Prevention**:
- URL validation before each stage
- Tab existence checks
- Content URL verification
- Abort on mismatches

### OffscreenManager (background/OffscreenManager.ts)

**Role**: Enable Chrome AI API access from service worker

**Why Needed**: Chrome AI APIs (Summarizer, Writer, Translator) only work in content scripts and offscreen documents due to user activation requirements. Service workers cannot access these APIs directly.

**Architecture**:
```typescript
// Service Worker (background)
const summary = await offscreenManager.summarize(text)

    ▼ chrome.runtime.sendMessage()

// Offscreen Document (offscreen/summarizer.ts)
const session = await ai.summarizer.create()
const result = await session.summarize(text)

    ▼ chrome.runtime.sendMessage()

// Service Worker receives response
return summary
```

**Features**:
- Lazy creation of offscreen document
- Request queuing and promise-based API
- Timeout handling (30s default)
- Automatic retry on failure

### ContentExtractor (content/ContentExtractor.ts)

**Role**: Extract meaningful content from web pages

**Extraction Process**:
1. Clone document body
2. Remove script/style/nav/footer/ads
3. Extract text content from main elements
4. Use DocumentChunker for passage generation
5. Return structured data

**Selectors** (from lib/constants/contentSelectors.ts):
```typescript
MAIN_CONTENT_SELECTORS: 'main', 'article', '[role="main"]', '#content'
EXCLUDED_SELECTORS: 'script', 'style', 'nav', 'footer', '.ad', ...
```

### DocumentChunker (content/DocumentChunker.ts)

**Role**: Chrome-inspired passage-based document segmentation

**Algorithm**:
```typescript
// Configuration (from lib/constants/contentSelectors.ts)
MAX_PASSAGE_WORDS = 200
MAX_PASSAGES_PER_PAGE = 30
MIN_PASSAGE_WORDS = 20

// Process
1. Split content into paragraphs
2. Group paragraphs into passages (~200 words)
3. Score passage quality (structure, length, indicators)
4. Filter low-quality passages
5. Return top passages ranked by quality
```

**Quality Scoring**:
```typescript
score = baseScore
  + structureBonus    // Headings, lists, emphasis
  + lengthBonus       // Optimal length (100-200 words)
  + contentBonus      // Keywords, proper nouns
  - navigationPenalty // Navigation-like content
  - boilerplatePenalty // Generic/repetitive text
```

**Output**: Array of `Passage` objects:
```typescript
interface Passage {
  text: string
  wordCount: number
  qualityScore: number
  position: number
}
```

---

## Search Architecture

### Hybrid Search (lib/search/HybridSearch.ts)

**Role**: Combine semantic and keyword search for best results

**Search Modes**:
```typescript
'hybrid'    // Semantic + Keyword + RRF (default)
'semantic'  // Vector similarity only
'keyword'   // TF-IDF only
```

**Hybrid Algorithm**:
```typescript
// 1. Run searches in parallel
const [semanticResults, keywordResults] = await Promise.all([
  vectorSearch.search(query, { topK: topK * 2 }),
  keywordSearch.search(query, { topK: topK * 2 })
])

// 2. Apply Reciprocal Rank Fusion
for each result:
  rrfScore = Σ(1 / (K + rank_i))  // K = 60 (from research)

// 3. Sort by RRF score and return top K
return sortedResults.slice(0, topK)
```

**Why RRF?**:
- Research-backed (SIGIR 2009: "Reciprocal Rank Fusion outperforms the best known automatic data fusion methods")
- No parameter tuning needed (K=60 works well universally)
- Robust to differences in score distributions
- Better than weighted averaging

**Configuration** (from lib/config/searchConfig.ts):
```typescript
DEFAULT_TOP_K = 10
DEFAULT_MIN_SIMILARITY = 0.3
RRF_CONSTANT = 60
SEARCH_MULTIPLIER = 2  // Fetch 2x results for better fusion
```

### Vector Search (lib/search/VectorSearch.ts)

**Role**: Semantic similarity search using embeddings

**Algorithm**:
```typescript
// 1. Generate query embedding
const queryEmbedding = await embeddingService.generateEmbedding(query)

// 2. Fetch all page embeddings from IndexedDB
const pages = await vectorStore.getAllPages()

// 3. Calculate cosine similarity
for each page:
  similarity = cosineSimilarity(queryEmbedding, page.embedding)

// 4. Filter by minimum threshold
filtered = pages.filter(p => p.similarity >= minSimilarity)

// 5. Rank by relevance
score = (similarity * 0.8) + (recencyScore * 0.2)

// 6. Return top K
return sorted.slice(0, topK)
```

**Cosine Similarity**:
```typescript
function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  let dotProduct = 0
  let normA = 0
  let normB = 0

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }

  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB))
}
```

### Keyword Search (lib/search/KeywordSearch.ts)

**Role**: TF-IDF based keyword search with field weighting

**Algorithm**:
```typescript
// 1. Tokenize and normalize query
const queryTokens = tokenize(query)
const stems = queryTokens.map(stem)

// 2. Calculate TF-IDF scores
for each page:
  for each field (title, url, summary, passages, content):
    tf = termFrequency(term, field)
    idf = inverseDocumentFrequency(term, allPages)
    fieldWeight = FIELD_WEIGHTS[field]
    score += tf * idf * fieldWeight

// 3. Apply bonuses
if (exactPhraseMatch):
  score *= 2.0
if (domainMatch):
  score *= 1.5

// 4. Return top K with matched terms
return results.map(r => ({
  ...r,
  keywordScore: r.score,
  matchedTerms: r.matchedTerms
}))
```

**Field Weights** (from lib/config/searchConfig.ts):
```typescript
FIELD_WEIGHTS = {
  title: 3.0,      // Most important
  url: 2.0,        // Domain/path keywords
  summary: 1.5,    // Concise overview
  passages: 1.5,   // Semantic chunks
  content: 1.0     // Full text
}
```

**Text Processing** (from lib/utils/textProcessing.ts):
```typescript
// Tokenization
tokens = text.toLowerCase()
  .split(/[^a-z0-9]+/)
  .filter(token => token.length > 0)
  .filter(token => !STOP_WORDS.has(token))

// Stemming (Porter Stemmer)
stems = tokens.map(stem)
```

---

## ML & AI Integration

### Embedding Service (lib/embeddings/EmbeddingService.ts)

**Model**: `all-MiniLM-L6-v2` from Hugging Face

**Specifications**:
- Dimensions: 384
- Max sequence length: 512 tokens
- Backend: Transformers.js + WASM
- Model size: ~23MB (downloaded once, cached in browser)

**API**:
```typescript
// Singleton pattern - import instance, not class
import { embeddingService } from '../lib/embeddings/EmbeddingService'

// Generate embedding
const embedding: Float32Array = await embeddingService.generateEmbedding(text)

// Batch generation
const embeddings: Float32Array[] = await embeddingService.generateEmbeddings(texts)
```

**Caching**:
```typescript
// LRU cache (max 1000 entries)
cacheKey = hash(normalizedText)
if (cache.has(cacheKey)):
  return cache.get(cacheKey)
else:
  embedding = await model.generate(text)
  cache.set(cacheKey, embedding)
  return embedding
```

**Lazy Initialization**:
```typescript
// Model loads on first use
private initPromise: Promise<void> | null = null

async generateEmbedding(text: string): Promise<Float32Array> {
  if (!this.initPromise) {
    this.initPromise = this.initialize()
  }
  await this.initPromise
  return this._generate(text)
}
```

### Summarizer Service (lib/summarizer/SummarizerService.ts)

**API**: Chrome Summarizer API (Gemini Nano)

**Requirements**:
- Chrome 138+ (Canary/Dev channels as of Oct 2024)
- Gemini Nano model installed
- Offscreen document context

**API**:
```typescript
// Singleton pattern
import { summarizerService } from '../lib/summarizer/SummarizerService'

// Generate summary
const summary: string = await summarizerService.summarize(text, {
  type: 'tl;dr',
  length: 'short'
})

// Check availability
const available: boolean = await summarizerService.isAvailable()
```

**Fallback Strategy**:
```typescript
try {
  return await offscreenManager.summarize(text)
} catch (error) {
  // Fallback: truncate to 200 characters
  return text.slice(0, 200).trim() + '...'
}
```

**Offscreen Communication**:
```typescript
// Service worker → Offscreen
chrome.runtime.sendMessage({
  type: 'SUMMARIZE_REQUEST',
  text: content
})

// Offscreen → Service worker
chrome.runtime.sendMessage({
  type: 'SUMMARIZE_RESPONSE',
  requestId,
  summary
})
```

---

## Storage Layer

### VectorStore (lib/storage/VectorStore.ts)

**Database**: IndexedDB

**Schema**:
```typescript
Database: 'RecallDB'
Version: 1

ObjectStore: 'pages'
  - keyPath: 'id' (UUID)
  - indexes:
    - 'url' (unique)
    - 'timestamp'
    - 'dwellTime'
    - 'lastAccessed'
```

**PageRecord Structure**:
```typescript
interface PageRecord {
  id: string                    // UUID
  url: string                   // Normalized URL
  title: string                 // Page title
  content: string               // Full text content
  summary: string               // Generated summary
  embedding: Float32Array       // 384-dim vector
  passages: Passage[]           // Semantic chunks
  timestamp: number             // Index time (ms)
  dwellTime: number             // Time spent (ms)
  lastAccessed: number          // Last visit (ms)
  visitCount?: number           // Number of visits
}
```

**API**:
```typescript
// Singleton pattern
import { vectorStore } from '../lib/storage/VectorStore'

// CRUD operations
await vectorStore.addPage(record)
const page = await vectorStore.getPage(id)
const page = await vectorStore.getPageByUrl(url)
await vectorStore.updatePage(id, updates)
await vectorStore.deletePage(id)

// Bulk operations
const allPages = await vectorStore.getAllPages()
await vectorStore.clear()

// Statistics
const stats = await vectorStore.getStats()
// Returns: { totalPages, totalSize, avgEmbeddingSize, ... }
```

**Float32Array Serialization**:
```typescript
// Problem: IndexedDB cannot store TypedArrays directly

// Solution: Serialize on write
_serializeRecord(record: PageRecord): any {
  return {
    ...record,
    embedding: record.embedding.buffer.slice(0)  // Float32Array → ArrayBuffer
  }
}

// Deserialize on read
_deserializeRecord(record: any): PageRecord {
  return {
    ...record,
    embedding: new Float32Array(record.embedding)  // ArrayBuffer → Float32Array
  }
}
```

**Indexes**:
```typescript
// URL lookup (unique)
await objectStore.index('url').get(normalizedUrl)

// Time range queries
await objectStore.index('timestamp')
  .getAll(IDBKeyRange.bound(startTime, endTime))

// Sort by access
await objectStore.index('lastAccessed').getAll()
```

---

## Performance Optimizations

### Caching Strategy

**Query Cache** (lib/utils/cache.ts):
```typescript
// LRU cache for search results
MAX_QUERY_CACHE_SIZE = 100

cacheKey = `${query}:${mode}:${topK}`
if (queryCache.has(cacheKey)):
  return queryCache.get(cacheKey)
else:
  results = await search(query)
  queryCache.set(cacheKey, results)
  return results
```

**Embedding Cache**:
```typescript
// LRU cache for embeddings
MAX_EMBEDDING_CACHE_SIZE = 1000

// Cache both query and document embeddings
cacheKey = hash(normalizedText)
```

**Metadata Cache**:
```typescript
// Cache frequently accessed metadata
MAX_METADATA_CACHE_SIZE = 500

// Page titles, URLs, summaries for quick display
```

### Lazy Initialization

**Pattern**:
```typescript
class Service {
  private initPromise: Promise<void> | null = null

  private async ensureInitialized() {
    if (!this.initPromise) {
      this.initPromise = this.initialize()
    }
    await this.initPromise
  }

  async method() {
    await this.ensureInitialized()
    // ... do work
  }
}
```

**Applied To**:
- EmbeddingService (model loading)
- SummarizerService (offscreen document)
- VectorStore (database connection)
- Phase 3 components (TabMonitor, IndexingQueue, etc.)

### Batch Processing

**Embedding Generation**:
```typescript
// Batch process multiple texts in one model call
async generateEmbeddings(texts: string[]): Promise<Float32Array[]> {
  const uncached = texts.filter(t => !cache.has(t))

  if (uncached.length > 0) {
    const embeddings = await model.encode(uncached)  // Batched
    uncached.forEach((text, i) => cache.set(text, embeddings[i]))
  }

  return texts.map(t => cache.get(t))
}
```

**IndexedDB Transactions**:
```typescript
// Bulk operations in single transaction
async addPages(records: PageRecord[]): Promise<void> {
  const tx = db.transaction(['pages'], 'readwrite')
  const store = tx.objectStore('pages')

  for (const record of records) {
    store.add(this._serializeRecord(record))
  }

  await tx.complete
}
```

### Logging & Monitoring

**Centralized Logger** (lib/utils/logger.ts):
```typescript
// Component-specific loggers
import { loggers } from '../lib/utils/logger'

loggers.indexing.debug('Processing page:', url)
loggers.search.info('Query:', query, 'Results:', count)
loggers.embeddings.error('Failed to generate:', error)

// Performance timing
loggers.search.timed('hybrid-search', () => {
  // ... search logic
})

// Async timing
await loggers.indexing.timedAsync('index-page', async () => {
  // ... async indexing
})
```

**Log Levels**:
```typescript
DEBUG   // Verbose logging (development)
INFO    // Important events
WARN    // Recoverable errors
ERROR   // Critical failures
```

---

## Extension Lifecycle

### Service Worker Lifecycle

**Initialization**:
```typescript
// chrome.runtime.onInstalled
1. Run Phase 1 initialization (immediate)
2. Set up message handlers
3. Log installation

// chrome.runtime.onStartup
1. Re-initialize Phase 3 components (lazy)
2. Resume indexing queue
3. Restart keepalive ping
```

**Keepalive**:
```typescript
// Prevent premature termination
setInterval(() => {
  chrome.runtime.getPlatformInfo()
}, 20000)  // Every 20 seconds
```

**Queue Processing**:
```typescript
// Background loop
setInterval(async () => {
  if (indexingQueue.isPaused()) return

  const item = indexingQueue.getNext()
  if (!item) return

  try {
    await indexingPipeline.processPage(item)
    indexingQueue.markComplete(item.url)
  } catch (error) {
    indexingQueue.markFailed(item.url, error.message)
  }
}, 500)  // Every 500ms
```

**Termination Handling**:
- Service workers can be killed by Chrome at any time
- All state is persisted in IndexedDB
- In-memory queue is volatile (acceptable trade-off)
- Components re-initialize on next message

### Content Script Lifecycle

**Injection**:
```typescript
// Dynamic injection (programmatic)
chrome.scripting.executeScript({
  target: { tabId },
  files: ['content/index.js']
})

// Static injection (manifest.json)
"content_scripts": [{
  "matches": ["<all_urls>"],
  "js": ["content/index.js"],
  "run_at": "document_idle"
}]
```

**Message Handling**:
```typescript
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'EXTRACT_CONTENT') {
    const result = extractContent()
    sendResponse(result)
  }
  return true  // Keep channel open for async response
})
```

### Offscreen Document Lifecycle

**Creation**:
```typescript
// Created on first summarization request
await chrome.offscreen.createDocument({
  url: 'offscreen/summarizer.html',
  reasons: [chrome.offscreen.Reason.DOM_SCRAPING],
  justification: 'Access Chrome Summarizer API'
})
```

**Communication**:
```typescript
// Bidirectional message passing
chrome.runtime.sendMessage({
  type: 'SUMMARIZE_REQUEST',
  requestId: uuid(),
  text: content
})

chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'SUMMARIZE_RESPONSE') {
    resolvePromise(message.requestId, message.summary)
  }
})
```

**Cleanup**:
```typescript
// Offscreen document persists until explicitly closed
await chrome.offscreen.closeDocument()

// OffscreenManager keeps it open for performance
```

---

## Security & Privacy

### Privacy Guarantees

**Zero Network Communication**:
- No analytics or telemetry
- No external API calls
- No data leaves the device
- All processing happens locally

**On-Device ML**:
- Embeddings: Transformers.js + WASM (local)
- Summarization: Chrome Summarizer API (local Gemini Nano)
- No cloud-based AI services

**Data Storage**:
- All data in local IndexedDB
- No sync to Chrome profile
- User can clear all data anytime

### Permissions

**Required Permissions** (manifest.json):
```json
{
  "permissions": [
    "tabs",           // Tab monitoring
    "webNavigation",  // Navigation events
    "storage",        // Chrome storage API
    "scripting",      // Content script injection
    "idle",           // Idle detection
    "offscreen"       // Offscreen document
  ],
  "host_permissions": [
    "<all_urls>"      // Content script on all sites
  ]
}
```

**Content Security Policy**:
```json
{
  "content_security_policy": {
    "extension_pages": "script-src 'self' 'wasm-unsafe-eval'; object-src 'self'"
  }
}
```

**Why `wasm-unsafe-eval`?**:
- Required for Transformers.js WASM modules
- WebAssembly cannot run without this directive
- Minimal security risk (WASM is sandboxed)

### Data Sanitization

**URL Normalization**:
```typescript
// Remove tracking parameters, fragments
normalizeUrl(url: string): string {
  const parsed = new URL(url)
  parsed.search = ''   // Remove query params
  parsed.hash = ''     // Remove fragments
  return parsed.href
}
```

**Content Filtering**:
```typescript
// Exclude sensitive content
EXCLUDED_PATTERNS = [
  /^chrome:\/\//,
  /^chrome-extension:\/\//,
  /^about:/,
  /^file:\/\//,
  /\/login/, /\/signin/, /\/password/,
  /banking/, /checkout/, /payment/
]
```

**PII Detection**:
```typescript
// Basic PII filtering (future enhancement)
function containsPII(text: string): boolean {
  // Email addresses
  if (/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/.test(text))
    return true

  // Credit card numbers
  if (/\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/.test(text))
    return true

  // Social security numbers
  if (/\b\d{3}-\d{2}-\d{4}\b/.test(text))
    return true

  return false
}
```

---

## Build & Deployment

### Build Configuration

**Vite Config** (vite.config.ts):
```typescript
export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        background: 'src/background/index.ts',
        content: 'src/content/index.ts',
        'ai-content': 'src/content/AIContentScript.ts',
        'offscreen-summarizer': 'src/offscreen/summarizer.ts',
        popup: 'src/ui/popup.ts',
        search: 'src/ui/search.ts'
      },
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: 'chunks/[name]-[hash].js'
      }
    },
    sourcemap: process.env.NODE_ENV === 'development'
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src')
    }
  }
})
```

**TypeScript Config** (tsconfig.json):
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022", "DOM", "WebWorker"],
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "allowImportingTsExtensions": true,
    "paths": {
      "@/*": ["./src/*"]
    }
  }
}
```

### Build Commands

```bash
# Development build with watch mode
npm run dev

# Production build (minified, no sourcemaps)
npm run build

# Type checking only (no build)
npm run type-check
```

### Loading Extension

```bash
# 1. Build the extension
npm run build

# 2. Open Chrome
# Navigate to chrome://extensions/

# 3. Enable Developer Mode
# Toggle switch in top-right corner

# 4. Load unpacked extension
# Click "Load unpacked" → select /dist directory

# 5. Verify installation
# Check for "Recall" extension in list
# Open popup to verify stats page loads
```

---

## Configuration Reference

### Search Configuration (lib/config/searchConfig.ts)

```typescript
export const SEARCH_CONFIG = {
  // Search parameters
  DEFAULT_TOP_K: 10,
  DEFAULT_MIN_SIMILARITY: 0.3,

  // RRF parameters
  RRF_CONSTANT: 60,
  SEARCH_MULTIPLIER: 2,

  // Ranking weights
  SIMILARITY_WEIGHT: 0.8,
  RECENCY_WEIGHT: 0.2,

  // Field weights
  FIELD_WEIGHTS: {
    title: 3.0,
    url: 2.0,
    summary: 1.5,
    passages: 1.5,
    content: 1.0
  },

  // Performance
  MAX_QUERY_CACHE_SIZE: 100,
  MAX_EMBEDDING_CACHE_SIZE: 1000,
  MAX_METADATA_CACHE_SIZE: 500,

  // Content extraction
  MIN_CONTENT_LENGTH: 100,
  MAX_CONTENT_LENGTH: 50000
}
```

### Content Selectors (lib/constants/contentSelectors.ts)

```typescript
export const CONTENT_SELECTORS = {
  MAIN_CONTENT: [
    'main',
    'article',
    '[role="main"]',
    '#content',
    '.content',
    '#main'
  ],

  EXCLUDED: [
    'script',
    'style',
    'nav',
    'footer',
    'header',
    '.ad',
    '.advertisement',
    '.sidebar',
    '.popup',
    '.modal'
  ]
}

export const CHUNKER_CONFIG = {
  MAX_PASSAGE_WORDS: 200,
  MIN_PASSAGE_WORDS: 20,
  MAX_PASSAGES_PER_PAGE: 30,
  OVERLAP_WORDS: 20
}
```

---

## Future Enhancements

### Planned Features

1. **Passage-Level Embeddings**
   - Embed each passage separately
   - More granular search results
   - "Jump to section" functionality

2. **Visit Count Tracking**
   - Track frequency of page visits
   - Incorporate into ranking algorithm
   - "Frequently visited" filter

3. **Tag & Category Support**
   - Auto-categorize pages (ML-based)
   - User-defined tags
   - Faceted search

4. **Export & Import**
   - Export indexed data (JSON)
   - Import from other browsers
   - Backup & restore

5. **Advanced Summarization**
   - Multi-level summaries (brief, medium, detailed)
   - Key quotes extraction
   - Timeline view for news articles

6. **Performance Improvements**
   - Web Worker for embeddings
   - Incremental indexing (delta updates)
   - Lazy passage loading

### Research Areas

1. **Hybrid Ranking**
   - Experiment with RRF alternatives (CombSUM, CombMNZ)
   - Learned-to-rank models
   - User feedback integration

2. **Semantic Compression**
   - Dimensionality reduction (384 → 128?)
   - Product quantization
   - Trade-off: size vs. accuracy

3. **Query Expansion**
   - Synonym expansion
   - Spell correction
   - Query rewriting

4. **Personalization**
   - User interest modeling
   - Contextual re-ranking
   - Privacy-preserving personalization

---

## References

### Research Papers

1. **Reciprocal Rank Fusion**
   - Cormack et al. (2009), "Reciprocal Rank Fusion outperforms the best known automatic data fusion methods"
   - SIGIR 2009

2. **Passage Retrieval**
   - Callan (1994), "Passage-level evidence in document retrieval"
   - Google Chrome history architecture

3. **Dense Retrieval**
   - Karpukhin et al. (2020), "Dense Passage Retrieval for Open-Domain Question Answering"
   - Facebook AI Research

### Documentation

- [Chrome Extension Manifest V3](https://developer.chrome.com/docs/extensions/mv3/)
- [Chrome AI APIs](https://developer.chrome.com/docs/ai/)
- [Transformers.js](https://huggingface.co/docs/transformers.js/)
- [IndexedDB API](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API)

---

## Appendix

### Message Protocol Reference

```typescript
// Search
{ type: 'SEARCH_QUERY', query: string, options?: SearchOptions }
→ { results: SearchResult[], mode: SearchMode }

// Database
{ type: 'GET_DB_STATS' }
→ { totalPages: number, totalSize: number, ... }

{ type: 'GET_ALL_PAGES' }
→ { pages: PageRecord[] }

{ type: 'CLEAR_HISTORY' }
→ { success: boolean }

// Indexing
{ type: 'GET_QUEUE_STATUS' }
→ { pending: number, processing: number, failed: number, paused: boolean }

{ type: 'PAUSE_INDEXING' }
→ { success: boolean }

{ type: 'RESUME_INDEXING' }
→ { success: boolean }

// Content extraction
{ type: 'EXTRACT_CONTENT' }
→ { title: string, content: string, url: string, passages: Passage[] }

// Summarization
{ type: 'SUMMARIZE_REQUEST', requestId: string, text: string }
→ { type: 'SUMMARIZE_RESPONSE', requestId: string, summary: string }

{ type: 'SUMMARIZER_STATUS' }
→ { available: boolean, error?: string }

{ type: 'OFFSCREEN_SUMMARIZER_READY' }
→ (no response)
```

### TypeScript Type Reference

```typescript
// Core types (lib/storage/types.ts)
interface PageRecord {
  id: string
  url: string
  title: string
  content: string
  summary: string
  embedding: Float32Array
  passages: Passage[]
  timestamp: number
  dwellTime: number
  lastAccessed: number
  visitCount?: number
}

interface Passage {
  text: string
  wordCount: number
  qualityScore: number
  position: number
}

// Search types (lib/search/types.ts)
interface SearchResult {
  id: string
  url: string
  title: string
  content: string
  summary: string
  timestamp: number
  score: number
  similarity?: number
  keywordScore?: number
  matchedTerms?: string[]
  passages?: Passage[]
}

interface SearchOptions {
  topK?: number
  minSimilarity?: number
  mode?: SearchMode
  includeContent?: boolean
}

type SearchMode = 'hybrid' | 'semantic' | 'keyword'

// Queue types
interface QueueItem {
  url: string
  title: string
  tabId: number
  timestamp: number
  dwellTime: number
  retryCount: number
  lastError?: string
  state: 'pending' | 'processing' | 'failed'
}
```

---

## Contributing

### Code Style

- **TypeScript strict mode**: All code must pass `npm run type-check`
- **No unused variables**: Enforced by tsconfig
- **Singleton pattern**: Use for all services (import instance, not class)
- **Centralized logging**: Use `loggers.<component>` from lib/utils/logger.ts
- **Async/await**: Prefer over callbacks and .then()
- **Error handling**: Always catch and log errors

### Testing

```bash
# Type checking
npm run type-check

# Load extension in Chrome
npm run build && open chrome://extensions/

# Monitor logs
# Open Chrome DevTools → Service Worker → Console
# Filter by component: "[IndexingPipeline]", "[HybridSearch]", etc.
```

### Pull Request Checklist

- [ ] Code passes `npm run type-check`
- [ ] No console errors in browser
- [ ] Tested indexing flow end-to-end
- [ ] Tested search (all modes: hybrid, semantic, keyword)
- [ ] Updated ARCHITECTURE.md if needed
- [ ] Added component-specific logging
- [ ] Followed singleton pattern for services

---

**Last Updated**: October 2024
**Version**: 1.0.0
**License**: MIT
