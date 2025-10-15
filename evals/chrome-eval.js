let evalResults = null;

async function runEval() {
  const statusEl = document.getElementById('status');
  const metricsEl = document.getElementById('metrics');
  const resultsEl = document.getElementById('results');
  const runBtn = document.getElementById('runBtn');
  const exportBtn = document.getElementById('exportBtn');

  runBtn.disabled = true;
  exportBtn.disabled = true;
  metricsEl.innerHTML = '';
  resultsEl.innerHTML = '';

  statusEl.className = 'status loading';
  statusEl.textContent = '⏳ Loading eval data...';

  try {
    let TEST_PAGES = [];
    let EVAL_QUERIES = [];
    let source = '';

    // Try to load from extension first (most reliable)
    if (typeof chrome !== 'undefined' && chrome.runtime) {
      statusEl.textContent = `⏳ Loading eval data from extension...`;
      try {
        const dataResponse = await chrome.runtime.sendMessage({
          type: 'GET_EVAL_DATA'
        });

        if (dataResponse && dataResponse.success) {
          TEST_PAGES = dataResponse.testPages;
          EVAL_QUERIES = dataResponse.queries;
          source = 'extension';
        }
      } catch (error) {
        console.warn('Failed to load from extension:', error);
      }
    }

    // Fallback to bundled data
    if ((!TEST_PAGES.length || !EVAL_QUERIES.length) && window.EVAL_DATA && window.EVAL_DATA.testPages?.length && window.EVAL_DATA.queries?.length) {
      statusEl.textContent = '⏳ Loading eval data from local bundle...';
      TEST_PAGES = window.EVAL_DATA.testPages;
      EVAL_QUERIES = window.EVAL_DATA.queries;
      source = 'bundle';
    }

    // Last resort: bootstrap
    if ((!TEST_PAGES.length || !EVAL_QUERIES.length) && window.__EVAL_BOOTSTRAP__) {
      statusEl.textContent = '⏳ Loading eval data from bootstrap payload...';
      TEST_PAGES = window.__EVAL_BOOTSTRAP__.testPages || [];
      EVAL_QUERIES = window.__EVAL_BOOTSTRAP__.queries || [];
      source = 'bootstrap';
    }

    if (!TEST_PAGES.length || !EVAL_QUERIES.length) {
      throw new Error('No eval dataset available. Check console for details.');
    }

    statusEl.textContent = `⏳ Running eval with ${TEST_PAGES.length} pages and ${EVAL_QUERIES.length} queries (source: ${source || 'unknown'})...`;

    const startTime = Date.now();
    let response = null;

    if (typeof chrome !== 'undefined' && chrome.runtime) {
      response = await chrome.runtime.sendMessage({
        type: 'RUN_EVAL',
        testPages: TEST_PAGES,
        queries: EVAL_QUERIES
      });
    } else {
      throw new Error('Chrome extension not available. Make sure the extension is installed and loaded.');
    }

    const totalTime = Date.now() - startTime;

    if (!response?.success) {
      throw new Error(response?.error || 'Eval failed');
    }

    evalResults = response;

    // Calculate metrics
    const metrics = calculateMetrics(response.queryResults);

    // Display success
    statusEl.className = 'status success';
    statusEl.textContent = `✅ Eval completed in ${(totalTime / 1000).toFixed(1)}s`;

    if (!response.summarizerAvailable) {
      statusEl.textContent += '\n⚠️  Chrome Summarizer API not available - using fallback';
    }

    // Display metrics
    displayMetrics(metrics, response);

    // Display detailed results
    displayResults(response.queryResults);

    exportBtn.disabled = false;

  } catch (error) {
    statusEl.className = 'status error';
    statusEl.textContent = '❌ Error: ' + error.message;
    console.error('Eval error:', error);
  } finally {
    runBtn.disabled = false;
  }
}

function calculateMetrics(queryResults) {
  let totalPrecision = 0;
  let totalRecall = 0;
  let totalMRR = 0;
  let totalNDCG = 0;
  let validQueries = 0;

  for (const qr of queryResults) {
    if (qr.error || !qr.results) continue;

    const topK = qr.results.slice(0, 10);
    const relevantInTopK = topK.filter(r => qr.expectedUrls.includes(r.url)).length;

    // Precision
    const precision = topK.length > 0 ? relevantInTopK / topK.length : 0;

    // Recall
    const recall = qr.expectedUrls.length > 0 ? relevantInTopK / qr.expectedUrls.length : 0;

    // MRR
    const firstRelevantIdx = topK.findIndex(r => qr.expectedUrls.includes(r.url));
    const mrr = firstRelevantIdx === -1 ? 0 : 1 / (firstRelevantIdx + 1);

    // NDCG
    const ndcg = calculateNDCG(topK, qr.relevance);

    totalPrecision += precision;
    totalRecall += recall;
    totalMRR += mrr;
    totalNDCG += ndcg;
    validQueries++;
  }

  return {
    avgPrecision: validQueries > 0 ? totalPrecision / validQueries : 0,
    avgRecall: validQueries > 0 ? totalRecall / validQueries : 0,
    avgMRR: validQueries > 0 ? totalMRR / validQueries : 0,
    avgNDCG: validQueries > 0 ? totalNDCG / validQueries : 0,
    validQueries,
    totalQueries: queryResults.length
  };
}

function calculateNDCG(results, relevanceMap) {
  const k = 10;
  const dcg = results.slice(0, k).reduce((sum, r, idx) => {
    const relevance = relevanceMap[r.url] || 0;
    return sum + relevance / Math.log2(idx + 2);
  }, 0);

  const idealOrder = Object.values(relevanceMap)
    .sort((a, b) => b - a)
    .slice(0, k);

  const idcg = idealOrder.reduce((sum, rel, idx) => {
    return sum + rel / Math.log2(idx + 2);
  }, 0);

  return idcg === 0 ? 0 : dcg / idcg;
}

function displayMetrics(metrics, response) {
  const metricsEl = document.getElementById('metrics');

  const avgIndexingTime = response.indexingResults.reduce((sum, r) => sum + (r.duration || 0), 0) / response.indexingResults.length;
  const successfulIndexing = response.indexingResults.filter(r => r.success).length;

  metricsEl.innerHTML = `
    <div class="metrics">
      <div class="metric-card">
        <div class="metric-value">${(metrics.avgPrecision * 100).toFixed(1)}%</div>
        <div class="metric-label">Precision@10</div>
      </div>
      <div class="metric-card">
        <div class="metric-value">${(metrics.avgRecall * 100).toFixed(1)}%</div>
        <div class="metric-label">Recall@10</div>
      </div>
      <div class="metric-card">
        <div class="metric-value">${metrics.avgMRR.toFixed(3)}</div>
        <div class="metric-label">MRR</div>
      </div>
      <div class="metric-card">
        <div class="metric-value">${metrics.avgNDCG.toFixed(3)}</div>
        <div class="metric-label">NDCG</div>
      </div>
      <div class="metric-card">
        <div class="metric-value">${successfulIndexing}/${response.indexingResults.length}</div>
        <div class="metric-label">Pages Indexed</div>
      </div>
      <div class="metric-card">
        <div class="metric-value">${avgIndexingTime.toFixed(0)}ms</div>
        <div class="metric-label">Avg Index Time</div>
      </div>
    </div>
  `;
}

function displayResults(queryResults) {
  const resultsEl = document.getElementById('results');

  let output = '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n';
  output += '📊 DETAILED RESULTS\n';
  output += '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n';

  queryResults.forEach((qr, idx) => {
    output += `${idx + 1}. Query: "${qr.query}"\n`;
    if (qr.description) {
      output += `   ${qr.description}\n`;
    }
    output += '\n';

    if (qr.error) {
      output += `   ❌ Error: ${qr.error}\n\n`;
      return;
    }

    output += `   Top 5 Results:\n`;
    qr.results.slice(0, 5).forEach((r, i) => {
      const isRelevant = qr.expectedUrls && qr.expectedUrls.includes(r.url);
      const marker = isRelevant ? '✓' : ' ';
      output += `   ${i + 1}. [${r.similarity.toFixed(3)}] ${marker} ${r.title.substring(0, 60)}\n`;
    });
    output += `\n   Query time: ${qr.duration}ms\n\n`;
  });

  resultsEl.innerHTML = output;
}

function exportResults() {
  if (!evalResults) return;

  const dataStr = JSON.stringify(evalResults, null, 2);
  const dataBlob = new Blob([dataStr], { type: 'application/json' });
  const url = URL.createObjectURL(dataBlob);

  const link = document.createElement('a');
  link.href = url;
  link.download = `eval-results-${new Date().toISOString()}.json`;
  link.click();

  URL.revokeObjectURL(url);
}

// Set up event listeners
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('runBtn').addEventListener('click', runEval);
  document.getElementById('exportBtn').addEventListener('click', exportResults);
});

// Auto-run if ?autorun=true
if (window.location.search.includes('autorun=true')) {
  window.addEventListener('load', () => {
    setTimeout(() => runEval(), 1000);
  });
}
