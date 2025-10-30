# Rewind. - Private AI Search for Your Browser History

> Search what you meant, not what you typed — with on-device AI.

**Rewind.** is a Chrome extension that lets you search your browsing history using natural language, powered entirely by on-device AI. No data ever leaves your machine.

## Key Features

- **Hybrid Search**: Combines semantic understanding with keyword precision using Reciprocal Rank Fusion
- **RAG Q&A**: Ask questions about your browsing history and get AI-generated answers with source citations
- **On-Device AI**: Uses Chrome's Gemini Nano (Summarizer API) + Transformers.js embeddings
- **100% Private**: All processing, storage, and search happens locally—no network requests
- **Fast**: Instant search with passage-level granularity
- **Smart Indexing**: Automatic indexing on page load with intelligent content extraction

## Quick Start

### Prerequisites

- Chrome 138+ with Gemini Nano installed
- Node.js 16+

### Installation

1. **Clone and install dependencies:**
   ```bash
   git clone <repo-url>
   cd recall-extension
   npm install
   ```

2. **Build the extension:**
   ```bash
   npm run build
   ```

3. **Load in Chrome:**
   - Open `chrome://extensions/`
   - Enable **Developer mode** (toggle in top-right)
   - Click **Load unpacked**
   - Select the `dist` folder

4. **Start browsing!** Pages are automatically indexed as you visit them.

## How to Use

### Search Tab
- Click the extension icon to open the sidebar
- Browse your history (latest first) or search with keywords/natural language
- Search results are ranked by relevance

### Ask Tab (RAG)
- Switch to the "Ask" tab
- Ask questions like:
  - "What did I read about machine learning?"
  - "Compare React and Vue from my browsing"
  - "How do I use Docker?"
- Get AI-generated answers with source citations from your browsing history

### Keyboard Shortcut
- Press `Cmd+Shift+E` (Mac) or `Ctrl+Shift+E` (Windows/Linux) to toggle the sidebar

## Architecture

### Indexing Pipeline
1. **Content Extraction**: Extracts clean text from web pages using DOM analysis
2. **Passage Chunking**: Breaks content into semantic passages (200 words max, Chrome-inspired)
3. **AI Summarization**: Generates concise summaries using Chrome's Gemini Nano
4. **Embeddings**: Creates 384-dimensional vectors using Transformers.js (all-MiniLM-L6-v2)
5. **Storage**: Saves to IndexedDB with passage-level embeddings

### Search System
- **Hybrid Search**: Combines semantic (vector) + keyword (TF-IDF) search using Reciprocal Rank Fusion
- **Passage-Level Retrieval**: Searches individual passages for better granularity
- **Quality-Aware Ranking**: Prioritizes high-quality passages using quality scores

### RAG System
- **Intent Classification**: Detects query type (factual, comparison, how-to, etc.)
- **Smart Retrieval**: Adapts retrieval strategy based on query intent
- **Context Assembly**: Builds intelligent context from relevant passages
- **AI Generation**: Uses Chrome Prompt API (Gemini Nano) for answer generation

## Development

```bash
# Watch mode (auto-rebuild on changes)
npm run dev

# Type checking only
npm run type-check

# Production build
npm run build
```

After building, reload the extension in `chrome://extensions/` to see changes.

## Project Structure

```
src/
├── background/       # Service worker, indexing pipeline, tab monitoring
├── content/          # Content scripts, DOM extraction, document chunking
├── offscreen/        # Chrome AI API access (Summarizer, Prompt)
├── lib/
│   ├── embeddings/   # Transformers.js embedding service
│   ├── search/       # Hybrid search, vector search, keyword search
│   ├── rag/          # RAG controller, passage retriever, intent classifier
│   ├── storage/      # IndexedDB vector store
│   └── utils/        # Logging, caching, text processing
└── ui/               # Popup and sidebar interfaces
```

## Tech Stack

- **TypeScript** - Type-safe codebase
- **Vite** - Fast build tool
- **Chrome Extension Manifest V3** - Latest extension platform
- **Transformers.js** - On-device ML inference (WASM)
- **Chrome Built-in AI** - Gemini Nano for summarization and Q&A
- **IndexedDB** - Local vector database

## Privacy

All processing happens **100% locally**:
- Content extraction on your device
- AI summarization via Chrome's on-device Gemini Nano
- Embedding generation using local WASM models
- Search queries never leave your machine
- Storage in local IndexedDB only

**No servers. No tracking. No data collection.**

## Use Cases

- **Research**: "What did I read about quantum computing last week?"
- **Learning**: "Compare the React hooks I researched"
- **Rewind.**: "Find that article about Docker networking"
- **Discovery**: "Show me pages about machine learning"
- **Synthesis**: "Summarize what I learned about TypeScript generics"

## Configuration

The extension auto-indexes pages as you browse. Default settings:
- Auto-indexing: **Enabled**
- Dwell time threshold: **10 seconds**
- Max pages: **10,000**

## Troubleshooting

**Extension not indexing pages?**
- Ensure Chrome 138+ with Gemini Nano is installed
- Check `chrome://extensions/` - look for errors in the service worker
- Try reloading the extension

**RAG/Ask tab not working?**
- Requires Chrome 138+ with Gemini Nano
- Check Chrome AI availability: visit `chrome://components/` and verify "Optimization Guide On Device Model" is up to date

**Search not finding pages?**
- Wait a few seconds after visiting a page for indexing to complete
- Check the badge icon on the extension - it shows queue size

## License

MIT
