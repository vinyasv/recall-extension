# Embeddings & Search: Complete Technical Explanation

## Table of Contents
1. [What is an Embedding?](#what-is-an-embedding)
2. [The Indexing Pipeline](#the-indexing-pipeline)
3. [Types of Embeddings We Generate](#types-of-embeddings-we-generate)
4. [The Search Process](#the-search-process)
5. [Similarity Calculation](#similarity-calculation)
6. [Ranking & Final Results](#ranking--final-results)

---

## What is an Embedding?

### The Simple Explanation

An **embedding** is a way to represent text as a list of numbers (a vector) that captures its **meaning**.

Think of it like GPS coordinates:
- New York City: `(40.7128° N, 74.0060° W)`
- Boston: `(42.3601° N, 71.0589° W)`
- Los Angeles: `(34.0522° N, 118.2437° W)`

Cities close in meaning (East Coast cities) have similar coordinates. Similarly:
- "machine learning" → `[0.23, -0.45, 0.67, ... 384 numbers]`
- "artificial intelligence" → `[0.21, -0.43, 0.69, ... 384 numbers]` (very similar!)
- "cooking recipes" → `[-0.78, 0.12, -0.34, ... 384 numbers]` (very different!)

### Technical Details

**Our Embeddings:**
- **Model**: `all-MiniLM-L6-v2` (from Hugging Face)
- **Dimensions**: 384 (each embedding is 384 numbers)
- **Type**: `Float32Array` (32-bit floating point numbers)
- **Normalization**: Vectors are normalized (length = 1.0)
- **Processing**: Runs locally using Transformers.js + WebAssembly

**Example:**
```javascript
// Input text
const text = "Machine learning is fascinating";

// Output embedding (384 dimensions)
const embedding = Float32Array([
  0.0234, -0.1245, 0.3421, 0.0892, -0.2341, ...
  // 379 more numbers
]);
```

### Why Embeddings Matter

**Without embeddings (keyword search):**
- Query: "artificial intelligence"
- Matches: Only pages containing those exact words
- Misses: Pages about "machine learning", "neural networks", "deep learning"

**With embeddings (semantic search):**
- Query: "artificial intelligence" → embedding vector
- Matches: All pages with **similar meaning**
- Finds: ML, neural nets, deep learning, AI, etc.

---

## The Indexing Pipeline

When you visit a webpage, here's what happens:

### Stage 1: Content Extraction

```
Webpage → DocumentChunker → Passages
```

**Example:**
```
Input: Long article about machine learning

Output:
  Passage 1: "Machine learning is a subset of AI that focuses..." (180 words)
  Passage 2: "Deep learning uses neural networks with multiple..." (195 words)
  Passage 3: "Applications include computer vision and NLP..." (170 words)
```

**Code:** `src/content/ContentExtractor.ts` + `src/content/DocumentChunker.ts`

---

### Stage 2: AI Summarization

```
Content → Chrome Summarizer API → Summary (800 chars)
```

**Example:**
```
Input: 2000 words of article content

Output: "This article explains machine learning fundamentals,
         including supervised and unsupervised learning. It covers
         neural networks, deep learning architectures, and practical
         applications in computer vision and NLP."
```

**Purpose:** Concise summary for page-level embedding
**Code:** `src/lib/summarizer/SummarizerService.ts`

---

### Stage 3: Passage Embeddings

**This is where the magic happens!**

```
For each passage:
  Passage Text → Embedding Model → 384D Vector
```

**Example:**
```javascript
Passage 1: "Machine learning is a subset of AI..."
  ↓
  Embedding Model (all-MiniLM-L6-v2)
  ↓
  Float32Array([0.234, -0.456, 0.789, ... 384 numbers])
```

**What's in the vector?**

Each dimension captures different semantic features:
- Dimension 0-50: Maybe topic (AI, cooking, sports, etc.)
- Dimension 51-100: Maybe sentiment (positive, negative)
- Dimension 101-200: Maybe entities (people, places, organizations)
- Dimension 201-384: Maybe relationships and context

**Important:** We don't control what each dimension means - the model learned this from training on billions of text examples!

**Code:** `IndexingPipeline.ts:221-250`
```typescript
private async _generatePassageEmbeddings(passages: Passage[]) {
  const passagesWithEmbeddings = [];

  for (const passage of passages) {
    // Generate 384D vector for this passage's text
    const embedding = await embeddingService.generateEmbedding(passage.text);

    passagesWithEmbeddings.push({
      ...passage,
      embedding: embedding // Float32Array with 384 numbers
    });
  }

  return passagesWithEmbeddings;
}
```

---

### Stage 4: Page-Level Embedding

We create ONE master embedding for the entire page by combining:

```
Page Embedding = Embed(Title + Summary + Top 3 Passages)
```

**Example:**
```javascript
// Input to embedding model
const pageEmbeddingText =
  "Machine Learning Tutorial. " +  // Title
  "This article explains ML fundamentals..." +  // Summary (800 chars)
  "Machine learning is a subset of AI... " +  // Passage 1 (best quality)
  "Deep learning uses neural networks... " +  // Passage 2
  "Applications include computer vision...";  // Passage 3

// Output
const pageEmbedding = Float32Array([...384 numbers...]);
```

**Why combine these?**
- **Title**: Core topic
- **Summary**: Overall gist
- **Top passages**: Key details

This creates a rich semantic representation of the entire page!

**Code:** `IndexingPipeline.ts:255-271`
```typescript
private _createPageEmbeddingText(title, summary, passages) {
  // Take top 3 highest-quality passages
  const topPassages = passages
    .filter(p => p.quality > 0.3)
    .sort((a, b) => b.quality - a.quality)
    .slice(0, 3);

  // Combine title, summary, and passage texts
  return [title, summary, ...topPassages.map(p => p.text)].join('. ');
}
```

---

### Stage 5: Storage

Everything gets stored in IndexedDB:

```javascript
{
  id: "page-uuid-123",
  url: "https://example.com/ml-tutorial",
  title: "Machine Learning Tutorial",
  content: "Full page text...",
  summary: "This article explains...",

  // Page-level embedding (for fast search)
  embedding: Float32Array([...384 numbers...]),

  // Passage-level embeddings (for granular search)
  passages: [
    {
      id: "passage-1",
      text: "Machine learning is...",
      wordCount: 180,
      quality: 0.85,
      embedding: Float32Array([...384 numbers...])
    },
    {
      id: "passage-2",
      text: "Deep learning uses...",
      wordCount: 195,
      quality: 0.78,
      embedding: Float32Array([...384 numbers...])
    },
    // ... more passages
  ]
}
```

**Storage Size:**
- Page embedding: 384 × 4 bytes = 1.5 KB
- Passage embedding: 384 × 4 bytes = 1.5 KB each
- 10 passages ≈ 15 KB + text content

---

## The Search Process

When you search for something, here's what happens:

### Step 1: Query Embedding

```
Your Query → Embedding Model → 384D Vector
```

**Example:**
```javascript
Query: "how does neural network training work"
  ↓
  Embedding Model
  ↓
queryEmbedding = Float32Array([0.245, -0.387, 0.612, ... 384 numbers])
```

**Code:** `src/lib/search/HybridSearch.ts:120`
```typescript
// Generate embedding for search query
const queryEmbedding = await embeddingService.generateEmbedding(query);
```

---

### Step 2: Two-Phase Search

#### Phase 1: Fast Page-Level Search

```
Query Vector → Compare with ALL page embeddings → Top Candidates
```

**Example:**
```
Query: "neural network training"
  ↓
  Compare with 1000 pages (page-level embeddings only)
  ↓
  Top 30 candidates (similarity > 0.5)
```

This is FAST because we only load metadata (not full passages).

**Code:** `src/lib/search/VectorSearch.ts:142-180`
```typescript
// Phase 1: Search using lightweight metadata
const pageMetadata = await vectorStore.getAllPageMetadata();

const candidates = [];
for (const metadata of pageMetadata) {
  // Calculate how similar query is to this page
  const similarity = cosineSimilarity(queryEmbedding, metadata.embedding);

  if (similarity >= minSimilarity) {
    candidates.push({ metadata, similarity });
  }
}

// Sort by similarity
candidates.sort((a, b) => b.similarity - a.similarity);

// Take top 30 (k × 3)
const topCandidates = candidates.slice(0, 30);
```

#### Phase 2: Granular Passage-Level Search

```
Top 30 Candidates → Load full passages → Re-rank by passage similarity
```

**Example:**
```
Top 30 pages from Phase 1
  ↓
  Load all passages for these 30 pages
  ↓
  Compare query with EACH passage embedding
  ↓
  Find best matching passage per page
  ↓
  Re-rank pages by best passage match
```

**Code:** `src/lib/search/VectorSearch.ts:186-236`
```typescript
// Phase 2: Load full pages and check passages
for (const candidate of topCandidates) {
  const fullPage = await vectorStore.getPage(candidate.metadata.id);

  let maxSimilarity = candidate.similarity; // Start with page-level

  // Check each passage
  for (const passage of fullPage.passages) {
    const passageSimilarity = cosineSimilarity(
      queryEmbedding,
      passage.embedding
    );

    // Keep track of best passage match
    maxSimilarity = Math.max(maxSimilarity, passageSimilarity);
  }

  // Use best similarity score (page or passage)
  finalResults.push({
    page: fullPage,
    similarity: maxSimilarity,
    relevanceScore: calculateRelevance(maxSimilarity, fullPage)
  });
}
```

---

## Similarity Calculation

### Cosine Similarity

This is how we measure "how similar" two embeddings are.

**Formula:**
```
similarity = (A · B) / (|A| × |B|)

Where:
  A · B = dot product (sum of element-wise multiplication)
  |A| = magnitude of vector A
  |B| = magnitude of vector B
```

**Code:** `src/lib/search/VectorSearch.ts:18-46`
```typescript
function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  let dotProduct = 0;
  let magnitudeA = 0;
  let magnitudeB = 0;

  // Calculate in single pass for efficiency
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];         // A · B
    magnitudeA += a[i] * a[i];         // |A|²
    magnitudeB += b[i] * b[i];         // |B|²
  }

  magnitudeA = Math.sqrt(magnitudeA);  // |A|
  magnitudeB = Math.sqrt(magnitudeB);  // |B|

  const similarity = dotProduct / (magnitudeA * magnitudeB);

  // Clamp to [0, 1] range
  return Math.max(0, Math.min(1, similarity));
}
```

**Example:**
```
Query embedding:   [0.5,  0.5,  0.0, ...]
Page embedding:    [0.6,  0.4,  0.1, ...]

Dot product:       0.5×0.6 + 0.5×0.4 + 0.0×0.1 + ... = 0.92
Magnitude A:       sqrt(0.5² + 0.5² + 0.0² + ...) = 1.0
Magnitude B:       sqrt(0.6² + 0.4² + 0.1² + ...) = 1.0

Similarity:        0.92 / (1.0 × 1.0) = 0.92 (very similar!)
```

**Interpretation:**
- **1.0** = Identical meaning
- **0.8-1.0** = Very similar (same topic, related concepts)
- **0.5-0.8** = Somewhat related
- **0.3-0.5** = Weakly related
- **0.0-0.3** = Unrelated

**Default threshold:** 0.5 (only return results with similarity ≥ 0.5)

---

## Ranking & Final Results

### Factors in Ranking

We don't just use similarity! We combine multiple signals:

```typescript
relevanceScore =
  similarity × 0.70 +         // Semantic similarity (70%)
  recencyScore × 0.15 +       // How recent (15%)
  frequencyScore × 0.15       // How often accessed (15%)
```

**Code:** `src/lib/search/VectorSearch.ts:90-109`
```typescript
function calculateRelevance(
  similarity: number,
  page: PageRecord,
  options: SearchOptions
): number {
  let score = similarity * 0.7; // Base: 70% from similarity

  if (options.boostRecent) {
    // Pages visited recently get a boost
    const recencyScore = calculateRecencyScore(page.timestamp);
    score += recencyScore * 0.15; // +15% for recency
  }

  if (options.boostFrequent) {
    // Pages accessed often get a boost
    const frequencyScore = calculateFrequencyScore(page.lastAccessed);
    score += frequencyScore * 0.15; // +15% for frequency
  }

  return score;
}
```

---

### Hybrid Search (RRF Fusion)

We actually run TWO searches in parallel:

1. **Semantic Search** (using embeddings)
2. **Keyword Search** (TF-IDF)

Then combine results using **Reciprocal Rank Fusion (RRF)**.

**Why?**
- Semantic search: Finds related concepts
- Keyword search: Finds exact terms
- Combined: Best of both worlds!

**Code:** `src/lib/search/HybridSearch.ts:117-167`
```typescript
// Run both searches in parallel
const [queryEmbedding, keywordResults] = await Promise.all([
  embeddingService.generateEmbedding(query),
  keywordSearch.search(query, { k: 20 })
]);

const semanticResults = await searchSimilar(queryEmbedding, { k: 20 });

// Combine using RRF
const fusedResults = reciprocalRankFusion([
  semanticResults,
  keywordResults
]);
```

**RRF Formula:**
```
For each result:
  RRF_score = Σ (1 / (k + rank))

Where:
  k = 60 (constant from research)
  rank = position in each ranked list (1, 2, 3, ...)
```

**Example:**
```
Page A:
  - Semantic rank: 1  → 1/(60+1) = 0.0164
  - Keyword rank: 3   → 1/(60+3) = 0.0159
  - RRF score: 0.0323

Page B:
  - Semantic rank: 5  → 1/(60+5) = 0.0154
  - Keyword rank: 1   → 1/(60+1) = 0.0164
  - RRF score: 0.0318

Result: Page A wins (appears high in BOTH lists)
```

This ensures pages that appear high in BOTH semantic and keyword search get prioritized!

---

## Complete Search Flow Diagram

```
USER TYPES QUERY: "how does neural network training work"
         ↓
    ┌────┴────┐
    │ Query   │
    │Embedding│
    └────┬────┘
         ↓
   Float32Array([0.245, -0.387, ...])
         ↓
    ┌────┴────────────────────────┐
    │  TWO-PHASE VECTOR SEARCH    │
    └────┬────────────────────────┘
         ↓
    ┌────────────────────────────┐
    │ PHASE 1: Page-Level Search │
    │ (Fast - metadata only)     │
    └────┬───────────────────────┘
         │
         ├─→ Load 1000 page embeddings
         ├─→ Calculate similarity for each
         ├─→ Filter (similarity ≥ 0.5)
         └─→ Sort by similarity
         ↓
    Top 30 candidates
         ↓
    ┌────────────────────────────────┐
    │ PHASE 2: Passage-Level Search  │
    │ (Detailed - full passages)     │
    └────┬───────────────────────────┘
         │
         ├─→ Load full pages (30)
         ├─→ Compare query with EACH passage
         ├─→ Track best match per page
         └─→ Re-rank by max similarity
         ↓
    10 results with scores:
      [0.92, 0.88, 0.85, 0.82, 0.79, ...]
         ↓
    ┌────────────────────┐
    │ RANKING & BOOSTING │
    └────┬───────────────┘
         │
         ├─→ Apply recency boost (+15%)
         ├─→ Apply frequency boost (+15%)
         └─→ Final relevance score
         ↓
    ┌─────────────────────┐
    │ HYBRID SEARCH (RRF) │
    └────┬────────────────┘
         │
         ├─→ Also run keyword search
         ├─→ Combine using RRF fusion
         └─→ Merge metadata
         ↓
    FINAL RESULTS:
      1. "Neural Networks Explained" (score: 0.94)
      2. "Deep Learning Training" (score: 0.89)
      3. "Backpropagation Tutorial" (score: 0.85)
      ...
```

---

## Example: End-to-End

### Indexing Phase

```
1. Visit: https://example.com/ml-tutorial

2. Extract content:
   - Title: "Machine Learning Tutorial"
   - 3 passages extracted (180, 195, 170 words)

3. Generate embeddings:
   - Passage 1 → [0.234, -0.456, 0.789, ... 384D]
   - Passage 2 → [0.221, -0.443, 0.801, ... 384D]
   - Passage 3 → [0.245, -0.431, 0.776, ... 384D]

4. Generate page embedding:
   - Combine: Title + Summary + Top 3 passages
   - Page embedding → [0.238, -0.447, 0.788, ... 384D]

5. Store in IndexedDB:
   - Page record with page embedding
   - 3 passages with their embeddings
```

### Search Phase

```
1. User searches: "how to train ML models"

2. Generate query embedding:
   - Query → [0.241, -0.450, 0.791, ... 384D]

3. Phase 1 (Fast):
   - Compare with 1000 pages
   - Example.com/ml-tutorial → similarity: 0.92
   - Top 30 candidates selected

4. Phase 2 (Detailed):
   - Load example.com/ml-tutorial passages
   - Passage 1 similarity: 0.88
   - Passage 2 similarity: 0.95 ← BEST MATCH!
   - Passage 3 similarity: 0.83
   - Max similarity: 0.95

5. Ranking:
   - Base score: 0.95 × 0.7 = 0.665
   - Recency boost: 0.8 × 0.15 = 0.120
   - Final: 0.785

6. Return:
   - Title: "Machine Learning Tutorial"
   - Similarity: 0.95
   - Relevance: 0.785
   - Best passage: "Deep learning training involves..."
```

---

## Key Takeaways

### What Each Embedding Represents

1. **Passage Embedding**: Semantic meaning of ~180 words of text
2. **Page Embedding**: Overall topic/theme of entire webpage
3. **Query Embedding**: Meaning of user's search query

### How Similarity Works

- **Cosine similarity** measures angle between vectors
- Closer angle = more similar meaning
- Range: 0.0 (unrelated) to 1.0 (identical)

### How Final Results Form

1. Generate query embedding
2. Find similar pages (Phase 1 - fast)
3. Check passages for best match (Phase 2 - detailed)
4. Apply ranking factors (recency, frequency)
5. Combine with keyword search (RRF)
6. Return top 10 results

### Why This Works

- **384 dimensions** capture nuanced semantic relationships
- **Passage-level** granularity finds specific relevant sections
- **Hybrid approach** combines semantic + exact matching
- **Local processing** preserves privacy (no cloud API calls)

---

## Performance Characteristics

### Indexing Speed

- **Passage extraction**: ~100ms
- **AI summarization**: ~2-3 seconds (Chrome API)
- **Embedding generation**: ~50ms per passage
- **Total**: ~5-10 seconds per page

### Search Speed

- **Phase 1** (1000 pages): ~50-100ms
- **Phase 2** (30 pages, ~300 passages): ~100-200ms
- **Total**: ~150-300ms (under 1 second!)

### Storage

- **Per page**: ~2-5 KB (embeddings) + text content
- **1000 pages**: ~10-20 MB
- IndexedDB limit: ~Several GB (plenty of room!)

---

## Technical Benefits

✅ **Semantic Understanding**: Finds related concepts, not just keywords
✅ **Privacy**: All processing happens locally, no data sent to servers
✅ **Speed**: Sub-second search across thousands of pages
✅ **Accuracy**: 384D embeddings capture nuanced meaning
✅ **Granularity**: Passage-level matching finds specific sections
✅ **Hybrid**: Combines semantic + keyword for best results
✅ **Scalable**: Efficient two-phase search handles large databases

---

**Questions? Check the code!**
- Indexing: `src/background/IndexingPipeline.ts`
- Embeddings: `src/lib/embeddings/EmbeddingService.ts`
- Search: `src/lib/search/VectorSearch.ts`
- Hybrid: `src/lib/search/HybridSearch.ts`
