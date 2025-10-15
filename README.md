# Recall - Private Hybrid Search for Browser History

Search what you meant, not what you typed — with on-device AI. Memex is a Chrome extension that combines semantic search with keyword search to find the right page from your browsing history, fast and privately. No data ever leaves your machine.

## Features

- 🔍 **Hybrid Search (Default)**: Reciprocal Rank Fusion of semantic vectors and TF‑IDF keywords
- 🤖 **On‑device AI**: Chrome Summarizer (Gemini Nano) + Transformers.js (all‑MiniLM‑L6‑v2)
- 🔒 **100% Private**: All summarization, embeddings, search, and storage run locally
- ⚡ **Fast**: 4–6ms query latency on typical datasets
- 💾 **Local Storage**: IndexedDB vector store
- 🧭 **Works Offline**: No network required

## Install

1. Install dependencies:
   ```bash
   npm install
   ```
2. Build the extension:
   ```bash
   npm run build
   ```
3. Load in Chrome:
   - Open `chrome://extensions/`
   - Enable Developer mode
   - Load unpacked → select the `dist` folder

## Use

- Open the popup or sidebar and search normally — hybrid mode runs automatically.
- Optionally, advanced UIs can pass a search mode: `semantic`, `keyword`, or `hybrid`.

## How it works (at a glance)

- Extracts page text via content scripts
- Summarizes on-device with Chrome Summarizer (Gemini Nano)
- Embeds `title + summary` using Transformers.js (384‑dim)
- Stores pages and vectors in IndexedDB
- At query time, runs TF‑IDF keyword search and vector search in parallel, then fuses results with RRF

## Tech

- TypeScript, Vite
- @huggingface/transformers v3 (WASM)
- IndexedDB

## Development

```bash
npm run dev        # Watch build
npm run type-check # TypeScript only
```

## Privacy

All processing (summarization, embeddings, search, storage) is done locally. Queries and page data never leave your device.

## License

MIT
