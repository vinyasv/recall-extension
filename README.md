# Memex - Private Semantic Search for Browser History

**Tagline**: Search what you meant, not what you typed

Memex is a Chrome Extension that enables semantic search over your browsing history using on-device AI. All processing happens locally on your machine - no data is ever sent to external servers.

## Features

- 🔍 **Semantic Search**: Find pages based on concepts, not just keywords
- 🔒 **100% Private**: All AI processing happens on your device
- 🚀 **Fast & Efficient**: Uses optimized quantized models
- 💾 **Local Storage**: IndexedDB-based vector database
- 🎯 **Smart Indexing**: Automatically indexes pages you spend time on
- ⌨️ **Omnibox Integration**: Search from the address bar with `mem <query>`

## Current Status

**Phase 1 Complete** ✅
**Phase 2 Complete** ✅

The following components are implemented and working:
- ✅ Chrome Extension foundation (Manifest V3)
- ✅ TypeScript configuration
- ✅ Vite build pipeline
- ✅ Embedding service (all-MiniLM-L6-v2 via Transformers.js)
- ✅ Background service worker
- ✅ Content script for page extraction
- ✅ Search UI (New Tab override)
- ✅ Popup UI
- ✅ **IndexedDB vector database** (Phase 2)
- ✅ **Vector search with cosine similarity** (Phase 2)
- ✅ **k-NN search algorithm** (Phase 2)
- ✅ **Relevance ranking** (Phase 2)
- ✅ **Working semantic search** (Phase 2)

**Coming Next**:
- Phase 3: Background indexing pipeline (automatic page visit detection, dwell-time tracking, AI summarization)
- Phase 4: Full integration and enhanced search features
- Phase 5: Enhanced features (omnibox, related concepts)
- Phase 6: Polish and optimization

## Installation

### Development Setup

1. **Clone the repository**:
   ```bash
   cd /Users/vinyas/historyextension
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Build the extension**:
   ```bash
   npm run build
   ```

4. **Load in Chrome**:
   - Open Chrome and navigate to `chrome://extensions/`
   - Enable "Developer mode" (toggle in top right)
   - Click "Load unpacked"
   - Select the `/Users/vinyas/historyextension/dist` directory

5. **Verify installation**:
   - You should see the Memex icon in your toolbar
   - Open a new tab - you should see the Memex search interface
   - Click the extension icon to see the popup

### Development Mode

To continuously rebuild during development:

```bash
npm run dev
```

This will watch for file changes and automatically rebuild the extension.

### Type Checking

To check TypeScript types without building:

```bash
npm run type-check
```

## Technical Stack

- **Language**: TypeScript
- **Build Tool**: Vite
- **UI**: Vanilla JavaScript with HTML/CSS
- **AI Model**: all-MiniLM-L6-v2 (384-dim embeddings)
- **ML Library**: @huggingface/transformers v3
- **Storage**: IndexedDB with vector serialization
- **Search**: Custom k-NN with cosine similarity and relevance ranking

## Project Structure

```
historyextension/
├── src/
│   ├── background/
│   │   └── index.ts         # Service worker with DB & search handlers
│   ├── content/
│   │   └── index.ts         # Content script for page extraction
│   ├── lib/
│   │   ├── embeddings/
│   │   │   └── EmbeddingService.ts  # ML embedding generation
│   │   ├── storage/
│   │   │   ├── types.ts     # Database type definitions
│   │   │   └── VectorStore.ts  # IndexedDB wrapper
│   │   └── search/
│   │       ├── types.ts     # Search type definitions
│   │       └── VectorSearch.ts  # k-NN search algorithm
│   ├── ui/
│   │   ├── search.html      # New tab search interface
│   │   ├── search.ts        # Search UI with real backend
│   │   ├── popup.html       # Extension popup
│   │   └── popup.ts         # Popup with database stats
│   └── utils/
│       └── uuid.ts          # UUID generation
├── public/
│   └── icons/               # Extension icons
├── dist/                    # Build output
├── manifest.json            # Chrome Extension manifest
├── vite.config.ts           # Vite configuration
├── tsconfig.json            # TypeScript configuration
├── package.json
├── IMPLEMENTATION_PLAN.md   # Detailed implementation roadmap
├── TESTING_PHASE2.md        # Phase 2 testing guide
└── README.md
```

## How It Works

### Phase 1 - Foundation (Complete ✅)

1. **Extension Foundation**: Complete Manifest V3 Chrome Extension setup
2. **Embedding Service**: Integration with Transformers.js for generating text embeddings
3. **Basic UI**: Search interface and popup ready for backend connection

### Phase 2 - Storage & Search (Complete ✅)

1. **Vector Database**: IndexedDB-based storage with efficient vector serialization
2. **Cosine Similarity**: Optimized similarity calculation for 384-dim embeddings
3. **k-NN Search**: Fast nearest neighbor search with relevance ranking
4. **Full Search Flow**: Query → Embedding → Search → Results with similarity scores

### Future Phases

3. **Background Indexing** (Phase 3): Automatically index pages based on dwell time
4. **Search Integration** (Phase 4): Connect UI to vector search backend
5. **Enhanced Features** (Phase 5): Omnibox integration, related concepts
6. **Polish** (Phase 6): Performance optimization, testing, documentation

## Privacy & Security

🔒 **Complete Privacy Guarantee**:
- All AI processing happens on your device
- No data is sent to external servers
- No tracking or analytics
- All data stored locally in IndexedDB
- Open source and auditable

## Development

### Building

```bash
npm run build      # Production build
npm run dev        # Development build with watch mode
```

### Testing (Future)

```bash
npm test           # Run unit tests (to be implemented)
```

## Requirements

- **Chrome Version**: 90+ (138+ recommended for Summarizer API)
- **Disk Space**: ~22 GB for Gemini Nano (optional Chrome AI API)
- **Memory**: 4+ GB RAM recommended
- **GPU**: 4+ GB VRAM recommended (optional, for WebGPU acceleration)

## Contributing

This is currently a development project. Contributions, feedback, and suggestions are welcome!

## License

MIT

## Roadmap

See [IMPLEMENTATION_PLAN.md](./IMPLEMENTATION_PLAN.md) for the complete implementation roadmap.

---

**Built with Claude Code** 🤖
