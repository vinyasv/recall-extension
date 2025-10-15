# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Memex/Rewind** is a Chrome Extension (Manifest V3) that provides private, on-device semantic search over browser history. All AI processing happens locally using Transformers.js and WebAssembly - no data is sent to external servers.

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
   - Stage 1: Extract content from page via content script
   - Stage 2: Generate summary using SummarizerService
   - Stage 3: Generate embeddings using EmbeddingService
   - Stage 4: Store in VectorStore
   - **URL validation**: Multiple checks prevent race conditions when tabs navigate away

4. **ContentExtractor** (content/ContentExtractor.ts): Extracts text content from web pages
   - Removes script/style tags and cleans HTML
   - Handles content script message passing

### ML Services

**EmbeddingService** (lib/embeddings/EmbeddingService.ts):
- Uses `all-MiniLM-L6-v2` model from Hugging Face Transformers.js
- Generates 384-dimensional embeddings
- Lazy initialization with promise-based loading
- LRU cache (max 1000 entries) to avoid redundant computations
- Singleton pattern: import `embeddingService` instance

**SummarizerService** (lib/summarizer/SummarizerService.ts):
- Uses Chrome's built-in Summarizer API (requires Chrome 138+ with Gemini Nano)
- Falls back to truncation if API unavailable
- Generates concise summaries for embedding

### Storage Layer

**VectorStore** (lib/storage/VectorStore.ts):
- IndexedDB wrapper for storing page records with embeddings
- Object store: `pages` with indexes on url, timestamp, dwellTime, lastAccessed
- **Float32Array serialization**: Embeddings stored as ArrayBuffer, deserialized on read
- Methods: addPage(), getPage(), getPageByUrl(), getAllPages(), updatePage()
- Singleton pattern: import `vectorStore` instance

**VectorSearch** (lib/search/VectorSearch.ts):
- k-NN search using cosine similarity
- Relevance ranking based on similarity scores and recency
- Search options: topK (default 10), minSimilarity threshold

### Data Types

All TypeScript types are centralized in:
- `lib/storage/types.ts`: PageRecord, DatabaseStats, DatabaseConfig
- `lib/search/types.ts`: SearchResult, SearchOptions

### Message Protocol

The extension uses chrome.runtime.sendMessage/onMessage for communication:

**Key message types:**
- `SEARCH_QUERY`: Perform semantic search (params: query, options)
- `GET_DB_STATS`: Get database statistics
- `GET_ALL_PAGES`: Retrieve all indexed pages
- `CLEAR_HISTORY`: Clear all indexed data
- `POPULATE_TEST_DATA`: Load test data from utils/testData.ts
- `GET_QUEUE_STATUS`: Get indexing queue status
- `PAUSE_INDEXING`/`RESUME_INDEXING`: Control indexing
- `EXTRACT_CONTENT`: Content script extracts page content

All async message handlers must `return true` to keep the message channel open.

## Build Configuration

**Vite** (vite.config.ts):
- Multi-entry build: background, content, ui/popup
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
│   └── IndexingPipeline.ts # 4-stage indexing workflow
├── content/             # Content scripts
│   ├── index.ts         # Content script entry
│   ├── ContentExtractor.ts # DOM content extraction
│   └── sidebar.ts       # Sidebar UI (keyboard shortcut: Cmd/Ctrl+Shift+E)
├── lib/                 # Core libraries (all singletons)
│   ├── embeddings/      # EmbeddingService (Transformers.js)
│   ├── storage/         # VectorStore (IndexedDB)
│   ├── search/          # VectorSearch (k-NN)
│   └── summarizer/      # SummarizerService (Chrome AI)
├── ui/                  # Extension UI
│   ├── popup.html/ts    # Extension popup (database stats)
│   └── search.html/ts   # Search interface (optional)
└── utils/               # Utilities
    ├── uuid.ts          # UUID generation
    └── testData.ts      # Test data for development
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

Use `POPULATE_TEST_DATA` message to load sample pages (see utils/testData.ts).

**Console logging pattern:**
```typescript
console.log('[ComponentName] Action description:', data);
```

All components follow this pattern for easy log filtering.

### Singleton Pattern

Core services are singletons - always import the instance, not the class:
```typescript
// Correct
import { embeddingService } from '../lib/embeddings/EmbeddingService';

// Incorrect
import { EmbeddingService } from '../lib/embeddings/EmbeddingService';
new EmbeddingService(); // Don't do this
```

### Float32Array Handling

Embeddings are Float32Array (384 dimensions). IndexedDB cannot store TypedArrays directly:
- **Store**: Convert to ArrayBuffer via `.buffer.slice()`
- **Retrieve**: Convert back via `new Float32Array(arrayBuffer)`

The VectorStore handles this automatically via _serializeRecord/_deserializeRecord.

## Chrome Extension Permissions

Required permissions (manifest.json):
- `tabs`: Tab monitoring
- `webNavigation`: Page navigation events
- `storage`: Chrome storage API
- `scripting`: Dynamic content script injection
- `idle`: Idle detection
- `<all_urls>`: Content script injection on all sites

**CSP**: Allows 'wasm-unsafe-eval' for Transformers.js WASM modules
