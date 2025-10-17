# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Rewind** is a Chrome Extension (Manifest V3) that provides private, on-device **hybrid search** over browser history using semantic vectors + keyword search. All AI processing happens locally using Chrome's Summarizer API (Gemini Nano) and Transformers.js with WebAssembly - no data is sent to external servers.

**Key Features:**
- Hybrid search with Reciprocal Rank Fusion (RRF)
- Passage-based document chunking (Chrome-inspired architecture)
- TF-IDF keyword search with field weighting
- On-device summarization via offscreen document
- 384-dimensional embeddings with LRU caching

## Build Commands

```bash
# Development build with watch mode
npm run dev

# Production build
npm run build

# Type checking only (no build)
npm run type-check
```

After building, load the extension in Chrome:
1. Navigate to `chrome://extensions/`
2. Enable "Developer mode"
3. Click "Load unpacked" and select `/dist` directory

## Architecture

### Service Worker Architecture (background/index.ts)

The background service worker is the central orchestrator:
- **Lazy initialization**: Components initialize only when needed, with promises to prevent double-initialization
- **Phase 3 components**: TabMonitor → IndexingQueue → IndexingPipeline → VectorStore
- **Queue processor**: Runs every 500ms to process queued pages from the indexing queue
- **Message passing**: All UI interactions go through chrome.runtime.onMessage handlers

### Indexing Pipeline Flow

1. **TabMonitor** (background/TabMonitor.ts): Tracks page visits and dwell time
   - Monitors tab navigation events
   - Calculates dwell time (time spent on page)
   - Triggers callback when page meets indexing criteria

2. **IndexingQueue** (background/IndexingQueue.ts): Manages pages waiting to be indexed
   - In-memory queue with retry logic
   - Tracks processing state and failure counts
   - Provides methods: add(), getNext(), markComplete(), markFailed()

3. **IndexingPipeline** (background/IndexingPipeline.ts): Orchestrates the full indexing workflow
   - Stage 1: Extract content + passages via content script (using DocumentChunker)
   - Stage 2: Generate summary using SummarizerService (via OffscreenManager)
   - Stage 3: Generate embeddings using EmbeddingService
   - Stage 4: Store in VectorStore with passage metadata
   - **URL validation**: Multiple checks prevent race conditions when tabs navigate away

4. **ContentExtractor** (content/ContentExtractor.ts): Extracts text content from web pages
   - Removes script/style tags and cleans HTML
   - Uses DocumentChunker for passage extraction
   - Handles content script message passing

5. **DocumentChunker** (content/DocumentChunker.ts): Chrome-inspired passage-based chunking
   - Breaks pages into semantic passages (200 words max)
   - Quality scoring for passage ranking
   - Preserves document structure and context
   - Configurable via CHUNKER_CONFIG constants

### ML Services

**EmbeddingService** (lib/embeddings/EmbeddingService.ts):
- Uses `all-MiniLM-L6-v2` model from Hugging Face Transformers.js
- Generates 384-dimensional embeddings
- Lazy initialization with promise-based loading
- LRU cache (max 1000 entries) to avoid redundant computations
- Singleton pattern: import `embeddingService` instance

**SummarizerService** (lib/summarizer/SummarizerService.ts):
- Uses Chrome's built-in Summarizer API (requires Chrome 138+ with Gemini Nano)
- Delegates to OffscreenManager for API access (bypasses user activation requirements)
- Falls back to truncation if API unavailable
- Generates concise summaries for embedding

**OffscreenManager** (background/OffscreenManager.ts):
- Manages offscreen document for Chrome AI API access
- Chrome AI APIs only work in content/offscreen contexts, not service workers
- Handles request queuing and response routing
- Promise-based async communication with offscreen document
- Singleton pattern: import `offscreenManager` instance

### Storage Layer

**VectorStore** (lib/storage/VectorStore.ts):
- IndexedDB wrapper for storing page records with embeddings and passages
- Object store: `pages` with indexes on url, timestamp, dwellTime, lastAccessed
- **Float32Array serialization**: Embeddings stored as ArrayBuffer, deserialized on read
- **Passage storage**: Each page includes array of Passage objects with text, wordCount, quality scores
- Methods: addPage(), getPage(), getPageByUrl(), getAllPages(), updatePage()
- Singleton pattern: import `vectorStore` instance

### Search Layer

**HybridSearch** (lib/search/HybridSearch.ts):
- Combines semantic and keyword search using Reciprocal Rank Fusion (RRF)
- Default mode: hybrid (semantic + keyword + RRF fusion)
- Alternative modes: semantic-only or keyword-only
- RRF constant K=60 (from research), search multiplier 2x for better fusion
- Query result caching for performance
- Singleton pattern: import `hybridSearch` instance

**VectorSearch** (lib/search/VectorSearch.ts):
- k-NN search using cosine similarity on embeddings
- Relevance ranking based on similarity scores and recency
- Search options: topK (default 10), minSimilarity threshold

**KeywordSearch** (lib/search/KeywordSearch.ts):
- TF-IDF based keyword search with field weighting
- Field weights: title (3.0), url (2.0), summary/passages (1.5), content (1.0)
- Exact phrase matching bonus (2x)
- Domain matching bonus (1.5x)
- Tokenization with stop word removal
- Returns matched terms for highlighting

### Data Types

All TypeScript types are centralized in:
- `lib/storage/types.ts`: PageRecord, Passage, DatabaseStats, DatabaseConfig
- `lib/search/types.ts`: SearchResult, SearchOptions, SearchMode, KeywordSearchResult, RankingConfig

### Configuration

Centralized configuration in `lib/config/` and `lib/constants/`:
- `lib/config/searchConfig.ts`: Search, ranking, RRF, performance, and content configs
- `lib/constants/contentSelectors.ts`: Content extraction selectors, chunking config, text processing constants

### Utilities

Helper functions in `lib/utils/`:
- `logger.ts`: Centralized logging with component-specific loggers and timing
- `cache.ts`: Global LRU caches for queries, embeddings, and metadata
- `textProcessing.ts`: Tokenization, stemming, field weights, text normalization
- `urlNormalization.ts`: URL cleaning and domain extraction

### Message Protocol

The extension uses chrome.runtime.sendMessage/onMessage for communication:

**Key message types:**
- `SEARCH_QUERY`: Perform hybrid search (params: query, options with mode: 'hybrid'|'semantic'|'keyword')
- `GET_DB_STATS`: Get database statistics
- `GET_ALL_PAGES`: Retrieve all indexed pages
- `CLEAR_HISTORY`: Clear all indexed data
- `POPULATE_TEST_DATA`: Load test data (Note: testData.ts removed in recent cleanup)
- `GET_QUEUE_STATUS`: Get indexing queue status
- `PAUSE_INDEXING`/`RESUME_INDEXING`: Control indexing
- `EXTRACT_CONTENT`: Content script extracts page content and passages
- `SUMMARIZE_REQUEST`: Offscreen document summarization request
- `SUMMARIZE_RESPONSE`: Offscreen document summarization response
- `SUMMARIZER_STATUS`: Check offscreen summarizer availability
- `OFFSCREEN_SUMMARIZER_READY`: Offscreen document ready signal

All async message handlers must `return true` to keep the message channel open.

## Build Configuration

**Vite** (vite.config.ts):
- Multi-entry build: background, content, ai-content, offscreen/summarizer, ui/popup
- Static file copying: manifest.json, icons, HTML files
- Path alias: `@` → `./src`
- Sourcemaps in development only

**TypeScript** (tsconfig.json):
- Target: ES2022 with bundler module resolution
- Strict mode enabled with noUnusedLocals/Parameters
- Allows `.ts` imports via allowImportingTsExtensions
- Libs: ES2022, DOM, WebWorker

## Extension Structure

```
src/
├── background/          # Service worker and indexing components
│   ├── index.ts         # Main service worker (message handlers, lifecycle)
│   ├── TabMonitor.ts    # Tab tracking and dwell time
│   ├── IndexingQueue.ts # Queue management
│   ├── IndexingPipeline.ts # 4-stage indexing workflow
│   └── OffscreenManager.ts # Manages offscreen document for Chrome AI
├── content/             # Content scripts
│   ├── index.ts         # Content script entry
│   ├── ContentExtractor.ts # DOM content extraction
│   ├── DocumentChunker.ts # Passage-based chunking (Chrome-inspired)
│   ├── AIContentScript.ts # Chrome AI API wrapper (legacy, not used)
│   └── sidebar.ts       # Sidebar UI (keyboard shortcut: Cmd/Ctrl+Shift+E)
├── offscreen/           # Offscreen document for Chrome AI
│   ├── summarizer.html  # Offscreen document HTML
│   └── summarizer.ts    # Chrome Summarizer API handler
├── lib/                 # Core libraries (all singletons)
│   ├── embeddings/      # EmbeddingService (Transformers.js)
│   ├── storage/         # VectorStore (IndexedDB), types
│   ├── search/          # HybridSearch, VectorSearch, KeywordSearch, types
│   ├── summarizer/      # SummarizerService (delegates to OffscreenManager)
│   ├── config/          # Centralized configuration
│   ├── constants/       # Content selectors, chunking config
│   └── utils/           # Logger, cache, text processing, URL normalization
├── ui/                  # Extension UI
│   ├── popup.html/ts    # Extension popup (database stats)
│   └── search.html/ts   # Search interface (optional)
└── utils/               # Utilities
    └── uuid.ts          # UUID generation
```

## Development Notes

### Service Worker Lifecycle

- Service workers can be terminated by Chrome at any time
- All components use lazy initialization with promise guards
- Keepalive ping every 20s to prevent premature termination
- Re-initialize Phase 3 on both chrome.runtime.onInstalled and onStartup

### Race Condition Prevention

The IndexingPipeline includes extensive URL validation:
1. Check tab exists before extraction
2. Normalize URLs (strip query params, fragments)
3. Verify tab URL matches expected URL before extraction
4. Double-check extracted content URL matches expected URL
5. Abort processing if any mismatch detected

This prevents indexing wrong content when tabs navigate quickly.

### Testing & Debugging

**Console logging pattern:**
```typescript
// Use centralized logger from lib/utils/logger.ts
import { loggers } from '../lib/utils/logger';

loggers.componentName.debug('Action description:', data);
loggers.componentName.timed('operation-name', () => { /* ... */ });
loggers.componentName.timedAsync('async-operation', async () => { /* ... */ });
```

All components follow this pattern for easy log filtering and performance monitoring.

### Singleton Pattern

Core services are singletons - always import the instance, not the class:
```typescript
// Correct
import { embeddingService } from '../lib/embeddings/EmbeddingService';
import { vectorStore } from '../lib/storage/VectorStore';
import { hybridSearch } from '../lib/search/HybridSearch';
import { keywordSearch } from '../lib/search/KeywordSearch';
import { offscreenManager } from '../background/OffscreenManager';

// Incorrect
import { EmbeddingService } from '../lib/embeddings/EmbeddingService';
new EmbeddingService(); // Don't do this
```

### Float32Array Handling

Embeddings are Float32Array (384 dimensions). IndexedDB cannot store TypedArrays directly:
- **Store**: Convert to ArrayBuffer via `.buffer.slice()`
- **Retrieve**: Convert back via `new Float32Array(arrayBuffer)`

The VectorStore handles this automatically via _serializeRecord/_deserializeRecord.

### Chrome AI Offscreen Document Pattern

Chrome AI APIs (Summarizer, Writer, Translator) only work in content scripts and offscreen documents due to user activation requirements. Service workers cannot access these APIs directly.

**Architecture:**
1. Service worker creates offscreen document via `chrome.offscreen.createDocument()`
2. Offscreen document loads Chrome AI APIs and maintains activation state
3. Service worker sends summarization requests via `chrome.runtime.sendMessage()`
4. Offscreen document processes requests and sends responses back
5. OffscreenManager handles queuing, timeouts, and promise-based API

**Key files:**
- `background/OffscreenManager.ts`: Service worker-side manager
- `offscreen/summarizer.html`: Offscreen document HTML
- `offscreen/summarizer.ts`: Offscreen-side handler with Chrome AI API

### Hybrid Search Architecture

**Search Mode Selection:**
```typescript
// Default: hybrid mode (semantic + keyword + RRF)
const results = await hybridSearch.search(query);

// Semantic-only mode
const results = await hybridSearch.search(query, { mode: 'semantic' });

// Keyword-only mode
const results = await hybridSearch.search(query, { mode: 'keyword' });
```

**RRF Algorithm:**
- Runs semantic and keyword searches in parallel (2x results for better fusion)
- Combines using Reciprocal Rank Fusion: `score = Σ(1 / (k + rank))` where k=60
- Enriches results with metadata from both sources (similarity, keywordScore, matchedTerms)
- Returns top-k results sorted by combined RRF score

### Passage-Based Chunking

DocumentChunker breaks pages into semantic passages (Chrome-inspired):
- Max 200 words per passage
- Max 30 passages per page
- Quality scoring based on length, structure, content indicators
- Preserves document structure and semantic boundaries
- Filters out navigation, ads, and boilerplate content

**Integration:**
- ContentExtractor uses DocumentChunker for passage extraction
- Passages stored alongside page records in VectorStore
- Used for keyword search (TF-IDF on passages)
- Future: passage-level embeddings for better granularity

## Chrome Extension Permissions

Required permissions (manifest.json):
- `tabs`: Tab monitoring
- `webNavigation`: Page navigation events
- `storage`: Chrome storage API
- `scripting`: Dynamic content script injection
- `idle`: Idle detection
- `offscreen`: Offscreen document creation for Chrome AI
- `<all_urls>`: Content script injection on all sites

**CSP**: Allows 'wasm-unsafe-eval' for Transformers.js WASM modules

## Recent Architecture Changes

**Removed eval harness:** The evaluation system (evals/, public/eval-data.js, evalData.ts, testData.ts) was removed. This was a development/testing framework for benchmarking search quality.

**Added hybrid search:** Transitioned from semantic-only to hybrid search with RRF fusion, combining the best of both semantic understanding and keyword precision.

**Added passage chunking:** Implemented Chrome-inspired DocumentChunker for passage-based processing, improving search granularity and content understanding.

**Centralized configuration:** Moved scattered config constants to `lib/config/searchConfig.ts` and `lib/constants/contentSelectors.ts` for better maintainability.

**Added offscreen document:** Implemented offscreen document pattern to access Chrome AI Summarizer API from service worker context.
