# Hybrid Search Implementation Plan

## Overview

Implement a lightweight hybrid search solution that combines **semantic search** (vector embeddings) with **keyword search** (TF-IDF) to provide the best of both worlds:

- **Semantic Search**: Understands concepts, handles synonyms, captures meaning
- **Keyword Search**: Exact matches, proper nouns, technical terms, URLs
- **Hybrid Fusion**: Combines both using Reciprocal Rank Fusion (RRF)

## Problem Statement

Current implementation only uses vector search (`VectorSearch.ts`), which is excellent for conceptual queries but can miss exact keyword matches that users expect. For example:

- ❌ Searching "github" might not return GitHub pages if content discusses "repository" instead
- ❌ Searching "react hooks" might miss pages with exact phrase due to semantic similarity noise
- ✅ Hybrid approach would catch both semantic meaning AND exact keyword matches

## Architecture Integration

### Current Flow
```
Sidebar → SEARCH_QUERY → Background → EmbeddingService → VectorSearch → Results
```

### New Hybrid Flow
```
Sidebar → SEARCH_QUERY → Background → HybridSearch
                                        ├─> EmbeddingService → VectorSearch → Ranked Results (R1)
                                        ├─> KeywordSearch (TF-IDF) → Ranked Results (R2)
                                        └─> RRF Fusion(R1, R2) → Combined Results
```

## Implementation Components

### 1. KeywordSearch Module
**File**: `src/lib/search/KeywordSearch.ts`

**Features**:
- **TF-IDF Algorithm**: Term Frequency × Inverse Document Frequency
- **Multi-field search**: Title (3x weight), Summary (2x), Content (1x), URL (1.5x)
- **Tokenization**: Lowercase, split on non-alphanumeric, filter stop words
- **Phrase matching**: Exact phrase gets 2x score boost
- **Domain matching**: URL/domain matches get bonus points

**Interface**:
```typescript
interface KeywordSearchResult {
  page: PageRecord;
  score: number;
  matchedTerms: string[];
}

class KeywordSearch {
  async search(query: string, options: { k?: number; minScore?: number }): Promise<KeywordSearchResult[]>
}
```

**Performance**: O(N) where N = number of pages (already loaded in memory by VectorStore.getAllPages())

### 2. HybridSearch Module
**File**: `src/lib/search/HybridSearch.ts`

**Features**:
- **Reciprocal Rank Fusion (RRF)**: Industry-standard algorithm for merging ranked lists
  - Formula: `score = Σ(1 / (k + rank))` where k=60 (constant)
  - Better than score normalization (avoids scale issues)
- **Three search modes**:
  - `semantic`: Vector search only
  - `keyword`: Keyword search only
  - `hybrid`: RRF fusion of both (default)
- **Parallel execution**: Run both searches concurrently
- **Smart deduplication**: Merge same page from both results, keep best combined score

**Interface**:
```typescript
type SearchMode = 'semantic' | 'keyword' | 'hybrid';

interface HybridSearchOptions extends SearchOptions {
  mode?: SearchMode;
  alpha?: number; // 0-1, weight for semantic vs keyword (optional)
}

class HybridSearch {
  async search(query: string, options: HybridSearchOptions): Promise<SearchResult[]>
}
```

**RRF Algorithm**:
```
For each result in R1 (vector results):
  score += 1 / (60 + rank_in_R1)

For each result in R2 (keyword results):
  score += 1 / (60 + rank_in_R2)

Sort by combined score, return top-k
```

### 3. Type Updates
**File**: `src/lib/search/types.ts`

**Additions**:
```typescript
// Search mode enum
export type SearchMode = 'semantic' | 'keyword' | 'hybrid';

// Extend SearchOptions
export interface SearchOptions {
  k?: number;
  minSimilarity?: number;
  boostRecent?: boolean;
  boostFrequent?: boolean;
  recencyWeight?: number;
  frequencyWeight?: number;

  // NEW: Hybrid search options
  mode?: SearchMode;           // Default: 'hybrid'
  alpha?: number;              // Semantic vs keyword weight (0-1)
}

// Keyword search result (internal)
export interface KeywordSearchResult {
  page: PageRecord;
  score: number;
  matchedTerms: string[];
}

// Extended search result (optional)
export interface SearchResult {
  page: PageRecord;
  similarity: number;
  relevanceScore: number;

  // NEW: Hybrid search metadata
  keywordScore?: number;       // Raw keyword score
  matchedTerms?: string[];     // Terms that matched
  searchMode?: SearchMode;     // Which mode produced this result
}
```

### 4. Background Handler Update
**File**: `src/background/index.ts`

**Changes**:
```typescript
import { hybridSearch } from '../lib/search/HybridSearch';

// In chrome.runtime.onMessage listener
case 'SEARCH_QUERY':
  (async () => {
    try {
      const { query, options } = message;

      // NEW: Use hybrid search instead of direct vector search
      const results = await hybridSearch.search(query, {
        mode: options?.mode || 'hybrid',  // Default to hybrid
        ...options
      });

      sendResponse({ success: true, results });
    } catch (error) {
      console.error('[Memex] Search failed:', error);
      sendResponse({ success: false, error: (error as Error).message });
    }
  })();
  return true;
```

## Implementation Details

### TF-IDF Weighting Strategy

**Title** (3x weight):
- Most important field
- Usually contains main topic/keywords
- Short, high signal-to-noise

**Summary** (2x weight):
- AI-generated summary
- Concise representation of content
- Better than full content for matching

**Content** (1x weight):
- Baseline weight
- Only scan first 2000 chars for performance
- Full content can dilute important terms

**URL/Domain** (1.5x weight):
- Important for site-specific searches
- Good for "github", "stackoverflow", etc.
- Domain names are high-signal

### Tokenization Strategy

**Simple & Fast**:
```typescript
1. Lowercase
2. Replace non-alphanumeric with spaces
3. Split on whitespace
4. Filter terms < 3 characters
5. Remove common stop words (the, a, is, etc.)
```

**No stemming initially** (keeps it lightweight):
- Can add Porter Stemmer later if needed
- Most queries work fine without it

### RRF Fusion Benefits

**Why RRF over weighted scoring?**
1. **No normalization needed**: Scores from different algorithms on different scales
2. **Rank-based**: Uses position, not absolute scores
3. **Proven effective**: Used by Elasticsearch, modern search engines
4. **Simple**: Easy to implement and understand

**k=60 constant**:
- Standard value from research
- Balances top results vs long tail
- Lower k = more weight to top results

## Performance Considerations

**Memory**: Minimal impact
- Already load all pages into memory (`getAllPages()`)
- Keyword search reuses same data
- TF-IDF calculations are O(N)

**Speed**:
- Parallel execution of both searches
- Keyword search is fast (simple string operations)
- Slight overhead from RRF fusion, but negligible

**Estimated latency**:
- 1000 pages: +5-10ms for keyword search
- RRF fusion: +1-2ms
- Total overhead: ~10-15ms (acceptable)

## Testing Strategy

### Test Queries

**Semantic-favored**:
- "machine learning tutorials" → should find AI/ML pages
- "cooking recipes" → should find food-related content

**Keyword-favored**:
- "github" → exact match on domain
- "React.useEffect" → exact technical term
- "stackoverflow.com" → URL match

**Hybrid-strength**:
- "javascript async await" → both concept + keywords
- "python data science" → field + keywords
- "react hooks tutorial" → framework + concept

### Test Data
Use existing `utils/testData.ts` + add specific test cases:
```typescript
TEST_CASES = [
  { query: "github", expected: ["GitHub pages"], mode: "keyword" },
  { query: "machine learning", expected: ["ML tutorials"], mode: "semantic" },
  { query: "react hooks", expected: ["React docs"], mode: "hybrid" },
]
```

## UI Integration (Optional Future Enhancement)

### Search Mode Toggle
Add to sidebar search UI:
```
┌─────────────────────────────────┐
│ [🔍 Semantic] [📝 Keyword] [⚡ Hybrid] │ <- Toggle buttons
│                                 │
│ ┌─────────────────────────────┐ │
│ │ search query...             │ │
│ └─────────────────────────────┘ │
└─────────────────────────────────┘
```

### Result Highlighting (Optional)
Show matched keywords in results:
```
Title: **Introduction** to React **Hooks**
       ^^^^^^^^^^^^^^        ^^^^^
       (matched terms highlighted)
```

## Migration Strategy

### Phase 1: Core Implementation
1. ✅ Create KeywordSearch module
2. ✅ Create HybridSearch module
3. ✅ Update type definitions
4. ✅ Update background handler

### Phase 2: Testing
1. Test with existing data
2. Compare results: semantic-only vs hybrid
3. Verify performance (latency, memory)

### Phase 3: Refinement
1. Tune field weights based on user feedback
2. Add more stop words if needed
3. Consider stemming if queries show need

### Phase 4: UI Enhancement (Optional)
1. Add mode toggle to sidebar
2. Show matched keywords
3. Add search tips/help

## File Structure

```
src/lib/search/
├── types.ts                # Updated with SearchMode, new options
├── VectorSearch.ts         # Unchanged (existing semantic search)
├── KeywordSearch.ts        # NEW: TF-IDF keyword search
└── HybridSearch.ts         # NEW: RRF fusion coordinator

src/background/
└── index.ts                # Updated: SEARCH_QUERY handler uses HybridSearch

docs/
└── hybrid-search-plan.md   # This document
```

## Expected Outcomes

### Better Results
- Exact keyword matches won't be missed
- Semantic understanding preserved
- Best of both approaches

### User Experience
- "Just works" for most queries
- No configuration needed (defaults to hybrid)
- Optional mode selection for power users

### Maintainability
- Clean separation of concerns
- Each search type in own module
- Easy to tune or extend

## Risks & Mitigations

**Risk**: Keyword search too slow on large datasets
**Mitigation**: Limit content scanning to 2000 chars, optimize tokenization

**Risk**: RRF fusion weights need tuning
**Mitigation**: Use proven k=60 constant, add optional alpha parameter for tuning

**Risk**: Stop words list too aggressive
**Mitigation**: Start minimal, expand based on testing

**Risk**: Breaking existing search behavior
**Mitigation**: Keep VectorSearch unchanged, hybrid is additive, default to hybrid mode

## Success Metrics

- ✅ All current semantic searches still work
- ✅ Keyword queries (github, stackoverflow) return correct pages
- ✅ Latency increase < 20ms on 1000-page database
- ✅ No memory issues or crashes
- ✅ User feedback positive on result relevance

## Future Enhancements

1. **Stemming**: Porter Stemmer for better term matching
2. **Fuzzy matching**: Levenshtein distance for typos
3. **Query expansion**: Synonyms, related terms
4. **Field boosting**: User-configurable weights
5. **Result caching**: Cache hybrid results for repeated queries
6. **Analytics**: Track which search mode produces clicked results

## References

- **RRF Paper**: "Reciprocal Rank Fusion outperforms Condorcet and individual Rank Learning Methods" (2009)
- **TF-IDF**: Classic IR algorithm, well-documented
- **Elasticsearch Hybrid**: Uses similar RRF approach for combining scores
- **Vector + Keyword**: Standard in modern search (Pinecone, Weaviate, Milvus)

---

**Status**: Ready for implementation
**Estimated effort**: 4-6 hours
**Dependencies**: None (uses existing infrastructure)
