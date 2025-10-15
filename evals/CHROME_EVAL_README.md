# Chrome-Based Evaluation System

## Overview

This system runs evaluations **inside Chrome** with the extension loaded, allowing you to test the **real Chrome Summarizer API with sharedContext**. Unlike Node.js evals which use fallback summarization, this tests your actual production pipeline.

## Architecture

```
npm run eval:chrome
    ↓
Puppeteer launches Chrome
    ↓
Loads extension from /dist
    ↓
Opens chrome-eval.html
    ↓
HTML page sends RUN_EVAL message to extension
    ↓
Extension runs full pipeline:
  - summarizeForSearch() with sharedContext
  - Real Chrome Summarizer API
  - Embeddings generated
  - Search queries executed
    ↓
Results sent back to HTML page
    ↓
Puppeteer extracts and prints results
```

## Usage

### Quick Start

```bash
# 1. Build the extension
npm run build

# 2. Run Chrome-based eval
npm run eval:chrome
```

The script will:
1. Launch Chrome with your extension auto-loaded
2. Run the full eval suite (35 pages, 20 queries)
3. Print detailed metrics and results
4. Keep Chrome open for manual inspection

### What Gets Tested

**Summarization (with Chrome Summarizer API):**
- ✅ `sharedContext` parameter (domain + title + topic)
- ✅ `type: 'key-points'` (concept extraction)
- ✅ `length: 'long'` (800 chars max)
- ✅ Fallback behavior if API unavailable

**Full Pipeline:**
- ✅ Content extraction
- ✅ Summary generation
- ✅ Embedding generation (title + summary)
- ✅ Vector storage
- ✅ Semantic search
- ✅ Ranking quality (MRR, NDCG)

**Metrics:**
- Precision@10
- Recall@10
- MRR (Mean Reciprocal Rank)
- NDCG (Normalized Discounted Cumulative Gain)
- Indexing performance (time per page, summary length)

## Comparing Node.js vs Chrome Evals

| Aspect | Node.js Eval | Chrome Eval |
|--------|-------------|-------------|
| **Speed** | Fast (~30s) | Slower (~2-3min) |
| **Setup** | Just `npm run eval` | Requires Chrome launch |
| **Summarizer** | ❌ Fallback only | ✅ Real Chrome API |
| **sharedContext** | ❌ Not tested | ✅ Tested |
| **Use Case** | Fast iteration | Final verification |

## Manual Testing

You can also open the eval page manually:

1. Build the extension: `npm run build`
2. Load extension in Chrome:
   - Navigate to `chrome://extensions/`
   - Enable "Developer mode"
   - Click "Load unpacked" → select `/dist`
3. Open `evals/chrome-eval.html` in Chrome
4. Click "Run Evaluation"
5. Watch the magic happen!

## Interpreting Results

### Summarizer API Status

```
✅ Chrome Summarizer API: AVAILABLE (using sharedContext!)
```
This means you're testing the real API with context-aware summarization.

```
⚠️  Chrome Summarizer API: NOT AVAILABLE (using fallback)
```
Chrome 138+ with Gemini Nano not available. Evals will use fallback summarization.

### Quality Thresholds

| Metric | Threshold | Meaning if Pass |
|--------|-----------|----------------|
| **Precision@10** | ≥ 30% | Top results are relevant |
| **Recall@10** | ≥ 50% | Finding most relevant docs |
| **MRR** | ≥ 0.50 | First result often relevant |
| **NDCG** | ≥ 0.60 | Good ranking quality |

### Example Output

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📈 CHROME EVAL RESULTS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✅ Chrome Summarizer API: AVAILABLE (using sharedContext!)

📚 Indexing Performance:
   • Pages indexed: 35/35
   • Failed: 0
   • Avg time per page: 1247ms
   • Avg summary length: 785 chars

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📈 AGGREGATE METRICS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

   Average Precision@10:  18.5%
   Average Recall@10:     100.0%
   Average MRR:           0.950
   Average NDCG:          0.912
   Average Similarity:    0.341

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🎯 QUALITY ASSESSMENT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

   ❌ Precision@10: 0.185 < 0.300
   ✅ Recall@10: 1.000 ≥ 0.500
   ✅ MRR: 0.950 ≥ 0.500
   ✅ NDCG: 0.912 ≥ 0.600

   Overall: 3/4 checks passed

   ⚠️  Some quality checks failed. Consider improvements.
```

## Troubleshooting

### "Chrome extension not available"

Make sure:
1. Extension is built (`npm run build`)
2. Path to `/dist` is correct
3. Chrome has permissions to load extension

### "Summarizer API not available"

You need:
- Chrome 138+ (or Canary/Dev channel)
- Gemini Nano model downloaded
- Run: `chrome://flags/#optimization-guide-on-device-model` → Enable

### Puppeteer Errors

If Puppeteer fails to launch:
```bash
# macOS
brew install chromium

# Or use system Chrome
export PUPPETEER_SKIP_DOWNLOAD=true
export PUPPETEER_EXECUTABLE_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
```

## Advanced: Comparing Before/After Changes

```bash
# Baseline
npm run eval:chrome > eval-before.txt

# Make changes to summarization...
# Edit src/lib/summarizer/SummarizerService.ts

# Rebuild and re-eval
npm run build
npm run eval:chrome > eval-after.txt

# Compare
diff eval-before.txt eval-after.txt
```

## Files

- `background/index.ts` - RUN_EVAL message handler
- `evals/chrome-eval.html` - UI for running evals in browser
- `evals/chrome-runner.ts` - Puppeteer automation script
- `evals/dataset.ts` - Test pages and queries

## Tips

1. **Use Node.js eval for fast iteration** during development
2. **Use Chrome eval for final verification** before shipping
3. **Export results** from the HTML page (button available) for analysis
4. **Compare metrics** across different implementations
5. **Watch console** in Chrome DevTools for detailed logs

## Future Improvements

- [ ] Add visual diff of summaries (with vs without sharedContext)
- [ ] Track performance over time (store results in SQLite)
- [ ] A/B test different summarization strategies
- [ ] Parallel query execution for faster evals
- [ ] CI/CD integration (headless mode with xvfb)
