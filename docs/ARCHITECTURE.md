# Rewind. - Architecture & Technical Overview

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

**Rewind.** is a privacy-first Chrome Extension (Manifest V3) that provides intelligent hybrid search over browser history. All processing happens locally on-device using Chrome's built-in AI capabilities and WebAssembly-based machine learning.

### Key Features

- **RAG-Powered Q&A**: Natural language question answering over browsing history using Chrome Prompt API (Gemini Nano)
- **Intelligent Hybrid Search**: Weighted RRF fusion (~90% semantic, 10% keyword) with confidence scoring
- **Passage-Only Architecture**: Simplified embeddings (passages only, no title/URL/page-level embeddings)
- **Balanced Semantic Search**: 0.58 similarity threshold tuned for realistic recall/precision trade-offs
- **Embeddings**: Google's EmbeddingGemma (308M params, 768 dimensions) with task-specific prefixes
- **On-Device ML**: 768-dimensional embeddings via Transformers.js + WASM/WebGPU
- **Zero Server Communication**: Complete privacy - no data leaves your device
- **Smart Indexing**: Chrome-inspired DocumentChunker with 200-word passages and quality scoring

### Technology Stack

- **Runtime**: Chrome Extension Manifest V3 (Service Worker)
- **Language**: TypeScript (ES2022, strict mode)
- **Build Tool**: Vite with multi-entry configuration
- **ML Framework**: Transformers.js (Hugging Face) with WASM backend
- **Embedding Model**: Google EmbeddingGemma-308M (768 dimensions, quantized, normalized)
- **RAG System**: Chrome Prompt API (Gemini Nano) with universal optimized prompt
- **Storage**: IndexedDB (via VectorStore abstraction)
- **Search**: Custom hybrid engine (semantic + TF-IDF + RRF) with dot product similarity
- **Similarity Metric**: Dot product (EmbeddingGemma outputs unit-normalized vectors)

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
│  │  ┌──────────┐ ┌────────┐ ┌──────────┐              │   │
│  │  │Embedding │ │ Hybrid │ │  Vector  │              │   │
│  │  │ Service  │ │ Search │ │  Store   │              │   │
│  │  └──────────┘ └────────┘ └──────────┘              │   │
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
├── offscreen/              # Offscreen document for Chrome Prompt API
│   ├── summarizer.html     # Offscreen document HTML
│   └── summarizer.ts       # Prompt API handler (RAG)
│
├── lib/                    # Core libraries (singletons)
│   ├── embeddings/         # Embedding generation
│   │   └── EmbeddingGemmaService.ts  # Google EmbeddingGemma (768d, quantized)
│   ├── prompt/             # Chrome Prompt API (RAG answer generation)
│   │   └── PromptService.ts
│   ├── rag/                # RAG components
│   │   ├── RAGController.ts          # Main RAG orchestrator
│   │   ├── PassageRetriever.ts       # Passage-level semantic search
│   │   └── types.ts
│   ├── storage/            # Data persistence
│   │   ├── VectorStore.ts
│   │   └── types.ts
│   ├── search/             # Search engines (hybrid search)
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
│  Stage 2: Passage Embeddings (PASSAGE-ONLY APPROACH)     │
│  ├─ Send each passage to EmbeddingGemmaService           │
│  ├─ Load EmbeddingGemma-308M model (cached, quantized)   │
│  ├─ Generate 768-dim normalized Float32Array per passage │
│  ├─ Use "title: none | text:" prefix for documents       │
│  ├─ Cache results in 2000-entry LRU cache                │
│  └─ FAIL if any passage embedding fails (required)       │
│                                                           │
│  Stage 3: Storage (SIMPLIFIED)                           │
│  ├─ Serialize embeddings (Float32Array → ArrayBuffer)    │
│  ├─ Store PageRecord with passage embeddings ONLY        │
│  ├─ Store page metadata (title, url, timestamp, etc.)    │
│  ├─ NO title/URL/page-level embeddings (removed)         │
│  └─ Update search indexes                                │
└──────┬───────────────────────────────────────────────────┘
       │
       ▼
┌──────────────────┐
│ Indexed and      │
│ searchable       │
└──────────────────┘
```

### Search Query Flow (Hybrid Search with Weighted RRF)

```
┌──────────────┐
│ User enters  │
│ search query │
└──────┬───────┘
       │
       ▼
┌──────────────────────────────────────────────────────────┐
│ HybridSearch (default mode, α=0.9)                       │
│                                                           │
│  ┌─────────────────────┐    ┌──────────────────────┐    │
│  │ Semantic Search     │    │ Keyword Search       │    │
│  ├─────────────────────┤    ├──────────────────────┤    │
│  │ 1. Embed query      │    │ 1. Tokenize query    │    │
│  │ 2. Passage search   │    │ 2. TF-IDF scoring    │    │
│  │ 3. Threshold: 0.70  │    │ 3. Field weighting   │    │
│  │ 4. Dynamic results  │    │ 4. Top 30 results    │    │
│  │ 5. Top 30 results   │    │    (3x multiplier)    │    │
│  └─────────┬───────────┘    └──────────┬───────────┘    │
│            │                           │                 │
│            └───────────┬───────────────┘                 │
│                        ▼                                 │
│            ┌───────────────────────┐                     │
│            │ Weighted RRF          │                     │
│            │ - K = 60              │                     │
│            │ - α = 0.7 (70/30)     │                     │
│            │ - Semantic: 70%       │                     │
│            │ - Keyword: 30%        │                     │
│            └───────────┬───────────┘                     │
│                        ▼                                 │
│            ┌───────────────────────┐                     │
│            │ Confidence Scoring    │                     │
│            │ - High: semantic≥0.70 │                     │
│            │ - Medium: keyword>0.5 │                     │
│            │ - Low: weak matches   │                     │
│            └───────────┬───────────┘                     │
└────────────────────────┼─────────────────────────────────┘
                         │
                         ▼
                  ┌──────────────┐
                  │ Top 10       │
                  │ results with │
                  │ confidence   │
                  └──────────────┘
```

### RAG Query Flow (Question Answering)

```
┌──────────────┐
│ User asks    │
│ question     │
└──────┬───────┘
       │
       ▼
┌──────────────────────────────────────────────────────────┐
│ Step 1: Passage Retrieval (PassageRetriever)             │
│  ┌───────────────────────────────────────────────────┐   │
│  │ 1. Generate query embedding (768-dim)             │   │
│  │    - Use "task: search result | query:" prefix    │   │
│  │    - EmbeddingGemma with normalized output        │   │
│  │ 2. Search ALL passage embeddings (not pages)      │   │
│  │ 3. Calculate dot product similarity per passage   │   │
│  │    - Optimal for normalized vectors               │   │
│  │ 4. Combine similarity + quality score             │   │
│  │ 5. Apply diversity constraints:                   │   │
│  │    - Max passages per page (2)                    │   │
│  │    - Max pages per domain (3)                     │   │
│  │ 6. Return top 5 passages                          │   │
│  └───────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────┘
       │
       ▼
┌──────────────────────────────────────────────────────────┐
│ Step 2: Context Building (RAGController)                 │
│  ┌───────────────────────────────────────────────────┐   │
│  │ For each source page:                             │   │
│  │  [Source N] Page Title                            │   │
│  │  URL: https://...                                 │   │
│  │  Visited: 2 days ago | Visited 3 times            │   │
│  │  Last accessed: 1 day ago | Time on page: 5 min   │   │
│  │                                                    │   │
│  │  [Passage 1 text...]                              │   │
│  │  [Passage 2 text...]                              │   │
│  │                                                    │   │
│  │ Max context length: 4000 chars                    │   │
│  └───────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────┘
       │
       ▼
┌──────────────────────────────────────────────────────────┐
│ Step 3: Answer Generation (PromptService)                │
│  ┌───────────────────────────────────────────────────┐   │
│  │ 1. Build prompt with:                             │   │
│  │    - Universal optimized system prompt            │   │
│  │    - Retrieved context with temporal metadata     │   │
│  │    - User question                                │   │
│  │ 2. Send to Chrome Prompt API (Gemini Nano)        │   │
│  │ 3. Stream or generate complete answer             │   │
│  │ 4. LLM cites sources as [Source N]                │   │
│  └───────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────┘
       │
       ▼
┌──────────────┐
│ Natural      │
│ language     │
│ answer with  │
│ source       │
│ citations    │
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
RAG_QUERY             → RAGController.answerQuestion()
GET_DB_STATS          → VectorStore.getStats()
GET_ALL_PAGES         → VectorStore.getAllPageMetadata()  // Chunked streaming
EXPORT_INDEX          → VectorStore.getAllPages()         // Chunked streaming
CLEAR_HISTORY         → VectorStore.clear()
PAUSE_INDEXING        → IndexingQueue.pause()
RESUME_INDEXING       → IndexingQueue.resume()
GET_QUEUE_STATUS      → IndexingQueue.getStatus()
```

`GET_ALL_PAGES` and `EXPORT_INDEX` send only a small handshake response directly. When the caller requests more than `HISTORY_CHUNK_SIZE` (100) or `EXPORT_CHUNK_SIZE` (25) records, the service worker streams payloads back to the tab via `GET_ALL_PAGES_CHUNK` / `GET_ALL_PAGES_COMPLETE` and `EXPORT_INDEX_CHUNK` / `EXPORT_INDEX_COMPLETE` messages to avoid Chrome’s message-length ceiling.

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

**Role**: Orchestrate 5-stage indexing workflow

**Stage 1: Content Extraction**
```typescript
// Inject content script (via manifest, automatically available)
// Send extraction request
chrome.tabs.sendMessage(tabId, { type: 'EXTRACT_CONTENT' })

// Receive: { title, content, url, passages[] }
// passages = DocumentChunker output with quality scores
```

**Stage 2: Passage Embeddings (PASSAGE-ONLY APPROACH)**
```typescript
// Generate embedding for EACH passage using EmbeddingGemma
const passagesWithEmbeddings = await this._generatePassageEmbeddings(passages)

// Process each passage with task-specific prefix
for (const passage of passages) {
  // Use 'document' task type for indexing (applies "title: none | text:" prefix)
  passage.embedding = await embeddingGemmaService.generateEmbedding(
    passage.text,
    'document'  // Critical for optimal retrieval quality
  )
}

// FAIL if any passage embedding fails - no silent fallback
// All passages MUST have embeddings for search and RAG
// EmbeddingGemma: 768-dimensional, normalized, quantized (q8, <200MB)
```

**Stage 3: Storage (SIMPLIFIED)**
```typescript
// Create PageRecord with ONLY passage embeddings
const record: PageRecord = {
  id: uuid(),
  url, title, content,
  passages: passagesWithEmbeddings, // Each has .embedding (for search & RAG)
  timestamp: Date.now(),
  dwellTime, lastAccessed, visitCount
}

// NO title/URL/page-level embeddings - removed for simplicity
// Passage-only approach provides better precision (100% @ 0.70 threshold)

// Store in IndexedDB
await vectorStore.addPage(record)
```

**Race Condition Prevention**:
- URL validation before each stage
- Tab existence checks
- Content URL verification
- Abort on mismatches

### OffscreenManager (background/OffscreenManager.ts)

**Role**: Enable Chrome Prompt API access from service worker for RAG

**Why Needed**: Chrome Prompt API (LanguageModel) only works in content scripts and offscreen documents due to user activation requirements. Service workers cannot access this API directly.

**Architecture**:
```typescript
// Service Worker (background)
const answer = await offscreenManager.prompt(question, context)

    ▼ chrome.runtime.sendMessage()

// Offscreen Document (offscreen/summarizer.ts)
const session = await LanguageModel.create()
const result = await session.prompt(question)

    ▼ chrome.runtime.sendMessage()

// Service Worker receives response
return answer
```

**Features**:
- Lazy creation of offscreen document
- Request queuing and promise-based API
- Streaming and non-streaming support
- Timeout handling (30s default)
- Automatic session cleanup

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

## RAG Components

### RAGController (lib/rag/RAGController.ts)

**Role**: Orchestrate Retrieval-Augmented Generation for question answering

**Key Responsibilities**:
- Retrieve relevant passages using PassageRetriever
- Build context with temporal metadata
- Generate natural language answers using PromptService
- Return answer with source citations

**API**:
```typescript
// Singleton pattern
import { ragController } from '../lib/rag/RAGController'

// Answer a question
const result = await ragController.answerQuestion(question, {
  topK: 5,
  minSimilarity: 0.3,
  maxContextLength: 4000,
  maxPassagesPerPage: 2,
  maxPagesPerDomain: 3,
  qualityWeight: 0.3
})

// Returns: { answer, sources, processingTime, searchTime, generationTime }

// Streaming version
for await (const chunk of ragController.answerQuestionStreaming(question)) {
  if (chunk.type === 'chunk') {
    // Display incremental answer
  } else if (chunk.type === 'complete') {
    // Show sources and timings
  }
}
```

**Fixed Configuration (No Intent Classification)**:
```typescript
// Universal retrieval parameters for all query types
topK: 5                    // Number of passages to retrieve
minSimilarity: 0.3         // Minimum dot product similarity
maxContextLength: 4000     // Maximum context in characters
maxPassagesPerPage: 2      // Max passages per page
maxPagesPerDomain: 3       // Max pages per domain
qualityWeight: 0.3         // Weight for passage quality score
```

### PassageRetriever (lib/rag/PassageRetriever.ts)

**Role**: Passage-level semantic search for fine-grained retrieval

**Key Features**:
- Searches passage embeddings directly (not page-level embeddings)
- Combines similarity score + passage quality score
- Applies diversity constraints (max passages per page/domain)
- Filters social media homepages (ephemeral content)
- Returns passages with temporal metadata (visit count, dwell time, recency)

**Algorithm**:
```typescript
async retrieve(query: string, options: RetrievalOptions): Promise<RetrievedPassage[]> {
  // 1. Generate query embedding with task-specific prefix
  // Use 'query' task type (applies "task: search result | query:" prefix)
  const queryEmbedding = await embeddingGemmaService.generateEmbedding(query, 'query')

  // 2. Get all pages
  const allPages = await vectorStore.getAllPages()

  // 3. Search ALL passage embeddings (not page embeddings!)
  for (const page of allPages) {
    for (const passage of page.passages) {
      // Use dot product for normalized vectors (faster than cosine)
      similarity = dotProduct(queryEmbedding, passage.embedding)
      combinedScore = similarity * (1 - qualityWeight) + quality * qualityWeight
      candidates.push({ passage, page, similarity, combinedScore })
    }
  }

  // 4. Sort by combined score
  candidates.sort((a, b) => b.combinedScore - a.combinedScore)

  // 5. Apply diversity constraints
  selected = applyDiversityConstraints(
    candidates,
    topK,
    maxPassagesPerPage,  // 2 passages per page
    maxPagesPerDomain    // 3 pages per domain
  )

  // 6. Return with metadata
  return selected.map(c => ({
    passage: c.passage,
    pageId, pageUrl, pageTitle,
    similarity, combinedScore,
    timestamp, visitCount, lastAccessed, dwellTime
  }))
}
```

**Homepage Filtering**:
```typescript
// Excludes ephemeral social media feeds
isHomepageUrl(url: string): boolean {
  // twitter.com, x.com, reddit.com, youtube.com, facebook.com,
  // instagram.com, tiktok.com, linkedin.com/feed
}
```


### PromptService (lib/prompt/PromptService.ts)

**Role**: Generate natural language answers using Chrome Prompt API (Gemini Nano)

**Key Features**:
- Universal optimized system prompt (handles all query types)
- Streaming and non-streaming answer generation
- Instructs LLM to cite sources as [Source N] for badge rendering
- Temporal metadata awareness in prompts
- Explicit retrieval constraints (no hallucination)

**API**:
```typescript
// Singleton pattern
import { promptService } from '../lib/prompt/PromptService'

// Non-streaming
const response = await promptService.generateAnswer(question, context, options)
// Returns: { answer, processingTime }

// Streaming
for await (const chunk of promptService.generateAnswerStreaming(question, context, options)) {
  console.log(chunk)  // Incremental text chunks
}
```

**Universal Optimized Prompt**:
```typescript
// Single prompt that handles all query types intelligently
"You are a precise AI assistant that answers questions based EXCLUSIVELY 
on the user's browsing history.

STRICT RETRIEVAL CONSTRAINTS:
1. Base your answer ONLY on the information in the provided context
2. NEVER use external knowledge or make assumptions beyond what's stated
3. If insufficient info, state: 'I don't have enough information...'
4. DO NOT fabricate, infer, or speculate

CONTEXT UNDERSTANDING:
- Each source includes temporal metadata (visit time, frequency, dwell time)
- Use temporal signals intelligently (recent, often visited, high engagement)
- Synthesize information from multiple sources when they complement
- If sources conflict, present both perspectives

CITATION REQUIREMENTS (CRITICAL):
- ALWAYS cite sources using exact format: [Source N]
- Place citations immediately after the relevant claim
- Examples:
  • 'React hooks were introduced in version 16.8 [Source 1].'
  • 'According to [Source 2], TypeScript improves maintainability.'
- Every factual claim must have a citation

RESPONSE STRUCTURE:
1. Start with a direct answer
2. Support with evidence from sources (with citations)
3. Provide additional context if available
4. Acknowledge gaps or limitations

ADAPT TO QUESTION TYPE:
- Factual: Direct, concise facts with citations
- Comparisons: Multiple perspectives, differences/similarities
- How-to: Numbered steps with actionable guidance
- Navigation: Identify page with temporal context"
```

**Context Building**:
```typescript
private _buildPromptWithContext(
  userQuestion: string,
  context: string,  // Built by RAGController with passages + metadata
  systemPrompt?: string
): string {
  const finalPrompt = systemPrompt || this._getUniversalPrompt()
  
  return `${finalPrompt}

CONTEXT FROM BROWSING HISTORY:
${context}

USER QUESTION:
${userQuestion}

ANSWER:`
}
```

---

## Search Architecture

### Hybrid Search (lib/search/HybridSearch.ts)

**Role**: Combine semantic and keyword search using weighted RRF with confidence scoring

**Search Modes**:
```typescript
'hybrid'    // Semantic + Keyword + Weighted RRF (default, α=0.7)
'semantic'  // Passage-only vector similarity (threshold: 0.70)
'keyword'   // TF-IDF only
```

**Hybrid Algorithm (Improved)**:
```typescript
// 1. Run searches in parallel
const [semanticResults, keywordResults] = await Promise.all([
  vectorSearch.search(query, { topK: topK * 3, threshold: 0.70 }),
  keywordSearch.search(query, { topK: topK * 3 })
])

// 2. Apply Weighted Reciprocal Rank Fusion
const requestedAlpha = options.alpha ?? RRF_CONFIG.DEFAULT_ALPHA  // Default: 0.9
const alpha = sanitizeAlpha(requestedAlpha)  // Clamp into [0, 1]
for each result:
  rrfScore = alpha * (1 / (K + semantic_rank)) +
             (1 - alpha) * (1 / (K + keyword_rank))

// 3. Calculate confidence scores
confidence = 
  (similarity >= 0.68 && keywordScore > 0) ? 'high' :   // Both agree
  (similarity >= 0.68) ? 'high' :                       // Strong semantic
  (similarity >= 0.58 || keywordScore > 0.5) ? 'medium' :
  'low'

// 4. Sort by RRF score and return top K with confidence
return sortedResults.slice(0, topK)
```

**Why Weighted RRF?**:
- Trusts high-precision semantic search (0.68+ regarded as strong matches)
- Keyword provides recall safety net (catches what semantic misses)
- Configurable α parameter for different query types
- Confidence scoring builds user trust
- Result objects include `fusionScore` (final RRF value) and `sourceScores` (per-source contribution map) for debugging and analytics.
- `sanitizeAlpha` clamps caller overrides into `[0,1]`, and invalid weight vectors fall back to uniform weights to prevent negative or runaway scores.

**Configuration** (from lib/config/searchConfig.ts):
```typescript
DEFAULT_TOP_K = 10
DEFAULT_MIN_SIMILARITY = 0.58     // Tuned for recall; 0.68+ treated as strong match
RRF_CONSTANT = 60
SEARCH_MULTIPLIER = 3             // Fetch 3x results (increased for sparse semantic)
DEFAULT_ALPHA = 0.9               // 90% semantic, 10% keyword (clamped in sanitizeAlpha)
```

**Validated Performance**:
- **Precision**: 92.9% (tested on 500-page corpus)
- **Recall (metric)**: 81.0%
- **MRR**: 0.929
- **Confidence Distribution**: 7.9 high, 2.1 medium (avg per query)

### Vector Search (lib/search/VectorSearch.ts)

**Role**: Passage-only semantic similarity search with threshold-based filtering

**Algorithm (SIMPLIFIED)**:
```typescript
// 1. Generate query embedding with task-specific prefix
const queryEmbedding = await embeddingGemmaService.generateEmbedding(query, 'query')

// 2. Fetch all pages with passages from IndexedDB
const pages = await vectorStore.getAllPages()

// 3. Search ALL passage embeddings (not page-level!)
for each page:
  for each passage:
    similarity = dotProduct(queryEmbedding, passage.embedding)
    
    // Filter by threshold (default: 0.58, configurable)
    if (similarity >= opts.minSimilarity):
      candidates.push({ page, passage, similarity })

// 4. Group by page and calculate scores
for each page with matching passages:
  score = maxPassageSimilarity
  if (multiplePassages):
    score += log(passageCount) * 0.05  // Multi-passage bonus

// 5. Sort and return (DYNAMIC count, not forced top-K)
return sorted.filter(score >= opts.minSimilarity).slice(0, maxResults)
```

**Key Improvements**:
- **Passage-only**: No page/title/URL embeddings (simpler, better precision)
- **Threshold-based**: Returns dynamic count (5-12 results vs forced 10)
- **High precision**: Similarity ≥0.68 is treated as a strong match; 0.70 maintained 100% precision in experiments while the default 0.58 improves recall
- **Content passages**: More discriminating than titles for semantic search

**Dot Product (Optimal for Normalized Vectors)**:
```typescript
// For normalized vectors (EmbeddingGemma output), dot product is mathematically
// equivalent to cosine similarity but 30-40% faster
function dotProduct(a: Float32Array, b: Float32Array): number {
  let sum = 0
  for (let i = 0; i < a.length; i++) {
    sum += a[i] * b[i]
  }
  return sum
}

// Why not cosine similarity?
// - EmbeddingGemma outputs normalized vectors (magnitude = 1)
// - For normalized vectors: dot(a,b) = cos(a,b)
// - No need to recalculate magnitude (already 1)
// - Significantly faster for large-scale search
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

### EmbeddingGemma Service (lib/embeddings/EmbeddingGemmaService.ts)

**Model**: `onnx-community/embeddinggemma-300m-ONNX` from Hugging Face

**Specifications**:
- **Model**: Google's EmbeddingGemma (state-of-the-art)
- **Parameters**: 308 million
- **Dimensions**: 768 (supports Matryoshka: 512, 256, 128)
- **Quantization**: Q8 (int8 quantized, <200MB)
- **Normalization**: Yes (outputs normalized vectors)
- **Backend**: Transformers.js + WASM/WebGPU
- **Languages**: 100+ languages supported
- **Similarity Metric**: Dot product (optimal for normalized output)

**Task-Specific Prefixes (CRITICAL for Quality)**:
```typescript
// Query prefix (for search queries)
"task: search result | query: {text}"

// Document prefix (for indexing)
"title: none | text: {text}"

// These prefixes are REQUIRED for optimal retrieval quality
// Based on official Google EmbeddingGemma documentation
```

**API**:
```typescript
// Singleton pattern - import instance, not class
import { embeddingGemmaService } from '../lib/embeddings/EmbeddingGemmaService'

// Generate embedding with task type
const embedding: Float32Array = await embeddingGemmaService.generateEmbedding(
  text,
  'query'      // or 'document'
)

// Batch generation
const embeddings: Float32Array[] = await embeddingGemmaService.generateEmbeddings(
  texts,
  'document',
  768          // dimensions (768, 512, 256, or 128)
)
```

**Performance**:
```typescript
// First call: ~50ms (model loading)
// Subsequent call: ~2-5ms (depends on WASM backend)
// Cache hit rate: >80% in corpus-scale testing

// LRU cache (max 2000 entries)
cacheKey = `${prefixedText}:${dimensions}`
if (cache.has(cacheKey)):
  return cache.get(cacheKey)
else:
  embedding = await model.generate(prefixedText)
  cache.set(cacheKey, embedding)
  return embedding
```

**Matryoshka Representation Learning**:
```typescript
// Supports truncation to lower dimensions without retraining
// First N dimensions contain most important information
const embedding768 = await embeddingGemmaService.generateEmbedding(text, 'document', 768)
const embedding512 = await embeddingGemmaService.generateEmbedding(text, 'document', 512)
const embedding256 = await embeddingGemmaService.generateEmbedding(text, 'document', 256)

// Truncated embeddings are automatically re-normalized
```

**Lazy Initialization**:
```typescript
// Model loads on first use
private initPromise: Promise<void> | null = null

async generateEmbedding(text: string, taskType: 'query' | 'document'): Promise<Float32Array> {
  if (!this.initPromise) {
    this.initPromise = this.initialize()
  }
  await this.initPromise
  return this._generate(text, taskType)
}
```


---

## Storage Layer

### VectorStore (lib/storage/VectorStore.ts)

**Database**: IndexedDB

**Schema**:
```typescript
Database: 'RewindDB'
Version: 1

ObjectStore: 'pages'
  - keyPath: 'id' (UUID)
  - indexes:
    - 'url' (unique)
    - 'timestamp'
    - 'dwellTime'
    - 'lastAccessed'
```

**PageRecord Structure (Simplified)**:
```typescript
interface PageRecord {
  id: string                    // UUID
  url: string                   // Normalized URL
  title: string                 // Page title
  content: string               // Full text content
  passages: Passage[]           // Semantic chunks with embeddings (ONLY embeddings stored)
  timestamp: number             // Index time (ms)
  dwellTime: number             // Time spent (ms)
  lastAccessed: number          // Last visit (ms)
  visitCount?: number           // Number of visits
}

// NOTE: No page/title/URL-level embeddings - passage-only approach
// Each passage in passages[] has its own .embedding (Float32Array, 768-dim)
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
- OffscreenManager (offscreen document for Prompt API)
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
// Created on first RAG request
await chrome.offscreen.createDocument({
  url: 'offscreen/summarizer.html',
  reasons: [chrome.offscreen.Reason.DOM_SCRAPING],
  justification: 'Access Chrome Prompt API for RAG'
})
```

**Communication**:
```typescript
// Bidirectional message passing for Prompt API
chrome.runtime.sendMessage({
  type: 'PROMPT_REQUEST',
  request: {
    id: uuid(),
    prompt: fullPrompt,
    options: { temperature, topK }
  }
})

chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'PROMPT_RESPONSE') {
    resolvePromise(message.response.id, message.response.answer)
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
- Embeddings: Transformers.js + WASM (local EmbeddingGemma)
- RAG: Chrome Prompt API (local Gemini Nano)
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
        'offscreen-prompt': 'src/offscreen/summarizer.ts',
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
# Check for "Rewind." extension in list
# Open popup to verify stats page loads
```

---

## Configuration Reference

### Search Configuration (lib/config/searchConfig.ts)

```typescript
export const SEARCH_CONFIG = {
  // Search parameters
  DEFAULT_TOP_K: 10,
  DEFAULT_MIN_SIMILARITY: 0.70,          // UPDATED: Validated optimal threshold

  // RRF parameters
  RRF_CONSTANT: 60,
  SEARCH_MULTIPLIER: 3,                  // UPDATED: 2 → 3 (for sparse semantic results)
  DEFAULT_ALPHA: 0.7,                    // NEW: 70% semantic, 30% keyword

  // Ranking weights
  SIMILARITY_WEIGHT: 0.8,
  RECENCY_WEIGHT: 0.2,

  // Field weights (keyword search)
  FIELD_WEIGHTS: {
    title: 3.0,
    summary: 2.0,                        // Passages/summary
    url: 1.5,
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

## Recent Improvements (October 2024)

### ✅ Completed Optimizations

1. **Simplified Passage-Only Architecture**
   - Removed title/URL/page-level embeddings
   - Passage embeddings only (simpler, better precision)
   - Validated: similarities ≥0.68 behave as strong matches; 0.70 delivered 100% precision during testing while lower defaults widen recall

2. **Weighted Reciprocal Rank Fusion**
   - Added configurable α parameter (default: 0.9)
   - `sanitizeAlpha` clamps overrides into `[0,1]`; mismatched weight vectors fall back to uniform
   - Keeps semantic signal dominant while still merging keyword recall

3. **Confidence Scoring**
   - High: Semantic ≥ 0.68 (with or without keyword agreement)
   - Medium: Semantic ≥ 0.58 or keyword score > 0.5
  - Low: Remaining matches
   - Builds user trust in results

4. **Optimized Thresholds & Parameters**
   - minSimilarity: 0.35 → **0.58** (validated optimal)
   - SEARCH_MULTIPLIER: 2 → **3** (handles sparse semantic results)
   - Dynamic result counts (not forced top-10)

5. **End-to-End Validation**
   - Tested on 500-page realistic corpus
   - Precision: 92.9%, Recall: 81.0%, MRR: 0.929
   - Full pipeline validated: extraction → indexing → search

6. **Chunked History & Export Streaming**
   - `GET_ALL_PAGES` returns metadata in 100-record chunks to stay under Chrome message limits
   - Added `EXPORT_INDEX` message with 25-record chunks and a temporary sidebar button to download full IndexedDB contents for offline analysis

## Future Enhancements

### Planned Features

1. **Tag & Category Support**
   - Auto-categorize pages (ML-based)
   - User-defined tags
   - Faceted search

2. **Export & Import**
   - Export indexed data (JSON)
   - Import from other browsers
   - Backup & restore

3. **Advanced Summarization**
   - Multi-level summaries (brief, medium, detailed)
   - Key quotes extraction
   - Timeline view for news articles

4. **Performance Improvements**
   - Web Worker for embeddings
   - Incremental indexing (delta updates)
   - Lazy passage loading

5. **Query Adaptations**
   - Auto-adjust α based on query type
   - Per-user α learning from feedback
   - Domain deduplication (max 2-3 results per domain)

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

// RAG (Question Answering)
{ type: 'RAG_QUERY', question: string, options?: RAGOptions }
→ { success: true, result: { answer: string, sources: SearchResult[], processingTime: number, searchTime: number, generationTime: number } }

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

// RAG (Prompt API)
{ type: 'PROMPT_REQUEST', request: { id: string, prompt: string, options: any } }
→ { type: 'PROMPT_RESPONSE', response: { id: string, answer: string } }

{ type: 'PROMPT_STREAMING_REQUEST', request: { id: string, prompt: string, options: any } }
→ { type: 'PROMPT_STREAM_CHUNK', requestId: string, chunk: string }
→ { type: 'PROMPT_STREAM_COMPLETE', requestId: string }

{ type: 'PROMPT_API_STATUS' }
→ { available: boolean }
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
  confidence?: 'high' | 'medium' | 'low'  // NEW: Confidence scoring
}

interface SearchOptions {
  topK?: number
  minSimilarity?: number              // Default: 0.70 (validated)
  mode?: SearchMode
  alpha?: number                      // NEW: Semantic vs keyword weight (0-1)
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
