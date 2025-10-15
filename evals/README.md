# Search Quality Evaluations

Automated evaluation suite for measuring search quality improvements. Runs entirely in Node.js without requiring the Chrome extension.

## Quick Start

```bash
npm run eval
```

## How It Works

The eval system runs **outside of Chrome** using Transformers.js in Node.js:

1. **Initialize**: Loads the embedding model (all-MiniLM-L6-v2) with CPU backend
2. **Index**: Generates embeddings for test pages (title + summary)
3. **Query**: Runs eval queries and ranks results by cosine similarity
4. **Measure**: Calculates IR metrics (precision, recall, MRR, NDCG)
5. **Report**: Prints detailed results and quality assessment

## Metrics Explained

### Precision@10
**What**: Percentage of top-10 results that are relevant
**Range**: 0.0 - 1.0 (higher is better)
**Threshold**: ≥ 0.30 (30% of results should be relevant)
**Example**: If 3 out of 10 results are relevant → Precision = 0.30

### Recall@10
**What**: Percentage of all relevant documents found in top-10
**Range**: 0.0 - 1.0 (higher is better)
**Threshold**: ≥ 0.50 (should find 50% of relevant docs)
**Example**: If 2 out of 4 relevant docs are in top-10 → Recall = 0.50

### MRR (Mean Reciprocal Rank)
**What**: 1 / rank of first relevant result
**Range**: 0.0 - 1.0 (higher is better)
**Threshold**: ≥ 0.50 (first relevant result should be in top 2)
**Example**:
- First result relevant → MRR = 1.0
- Second result relevant → MRR = 0.5
- Third result relevant → MRR = 0.33

### NDCG (Normalized Discounted Cumulative Gain)
**What**: Ranking quality considering graded relevance (0-5 scale)
**Range**: 0.0 - 1.0 (higher is better)
**Threshold**: ≥ 0.60 (good ranking quality)
**Why**: Rewards highly relevant docs at top positions, penalizes bad ranking

## File Structure

```
evals/
├── README.md          # This file
├── dataset.ts         # Test pages and eval queries with ground truth
├── metrics.ts         # Metric calculation (precision, recall, MRR, NDCG)
└── runner.ts          # Main eval script
```

## Adding New Eval Queries

Edit `dataset.ts` and add to `EVAL_QUERIES`:

```typescript
{
  query: "your search query",
  description: "What this tests",
  expectedUrls: [
    "https://url-that-should-appear.com",
    "https://another-relevant-url.com",
  ],
  relevance: {
    "https://url-that-should-appear.com": 5,      // Very relevant
    "https://another-relevant-url.com": 4,        // Relevant
    "https://somewhat-related.com": 2,            // Somewhat relevant
    "https://not-relevant.com": 0,                // Not relevant
  }
}
```

## Adding Test Pages

Edit `dataset.ts` and add to `TEST_PAGES`:

```typescript
{
  url: "https://example.com",
  title: "Page Title",
  summary: "A concise summary (800 chars recommended)",
  content: "Full page content (for reference, not used in embeddings)"
}
```

**Important**: Embeddings are generated from `title + ". " + summary` to match production behavior.

## Environment Details

### Transformers.js Backend
- **Browser**: Uses WASM backend
- **Node.js**: Uses CPU backend
- Auto-detected by `EmbeddingService`

### Model Loading
- First run: Downloads model (~25MB) to cache
- Subsequent runs: Loads from cache (~5 seconds)
- Cache location: `~/.cache/huggingface/`

## Regression Testing

Use this in CI/CD to prevent quality regressions:

```bash
# Add to GitHub Actions / CI pipeline
npm run eval

# Exit code 0 if all thresholds pass
# Exit code 1 if any threshold fails
```

## Interpreting Results

### ✅ All checks passed
Search quality is good. Ship it!

### ⚠️ Some checks failed
- **Low Precision**: Too many irrelevant results (increase threshold, improve ranking)
- **Low Recall**: Missing relevant docs (improve embedding quality, increase K)
- **Low MRR**: First result not relevant (improve ranking weights)
- **Low NDCG**: Poor ranking order (adjust recency/frequency weights)

### 🚨 Multiple checks failed
Search needs significant improvement. Consider:
1. Increasing summary length (more context)
2. Including more metadata in embeddings (title, URL, tags)
3. Adjusting search parameters (minSimilarity, recency weight)
4. Fine-tuning the embedding model

## Tips

### Fast Iteration
Run a single query to test changes quickly:

```typescript
// In runner.ts, filter to one query:
const results = EVAL_QUERIES.filter(q => q.query === "react hooks")
```

### Debugging Similarity Scores
Print all results (not just top 5):

```typescript
console.log(ranked); // Show all 10 results with scores
```

### Comparing Before/After
Save eval output to files:

```bash
npm run eval > eval-before.txt
# Make changes
npm run eval > eval-after.txt
diff eval-before.txt eval-after.txt
```

## Common Issues

### "Unsupported device: wasm"
You're running in Node.js but the code tries to use WASM. Fixed in `EmbeddingService.ts` with auto-detection.

### Model download slow
First run downloads ~25MB. Subsequent runs use cache. Use a faster network or download manually:

```bash
# Download model ahead of time
node -e "require('@huggingface/transformers').pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2')"
```

### Out of memory
Reduce batch size or use quantized model (already enabled).
