/**
 * Eval Bridge - Provides a window API for Puppeteer to query RAG
 */

// Expose RAG query function to window for Puppeteer access
(window as any).queryRAG = async function(question: string, options: any = {}) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(
      {
        type: 'RAG_QUERY',
        question,
        options: {
          topK: options.topK || 5,
          minSimilarity: options.minSimilarity || 0.3,
        },
      },
      (response: any) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }

        if (response && response.success) {
          resolve({
            answer: response.answer,
            sources: response.sources || [],
            timings: response.timings || { total: 0, search: 0, generation: 0 },
          });
        } else {
          reject(new Error(response?.error || 'RAG query failed'));
        }
      }
    );
  });
};

console.log('[Eval Bridge] Ready - window.queryRAG() is available');
document.getElementById('status')!.textContent = 'Ready - queryRAG() available';
