/**
 * Rewind Popup - Triggers sidebar on current tab
 */

console.log('[Rewind Popup] Initializing...');

// When popup opens, send message to current tab to open sidebar
chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
  if (!tabs[0]?.id) {
    console.error('[Rewind Popup] No active tab found');
    return;
  }

  const tabId = tabs[0].id;
  const tabUrl = tabs[0].url || '';

  // Check if this is a restricted page
  if (tabUrl.startsWith('chrome://') || 
      tabUrl.startsWith('chrome-extension://') || 
      tabUrl.startsWith('about:') ||
      tabUrl.startsWith('edge://')) {
    document.body.innerHTML = `
      <div style="padding: 20px; font-family: Inter, sans-serif; text-align: center;">
        <p style="color: #666; margin-bottom: 12px;">Cannot open on browser pages</p>
        <p style="color: #999; font-size: 11px;">Try a regular website</p>
      </div>
    `;
    return;
  }

  try {
    console.log('[Rewind Popup] Sending TOGGLE_SIDEBAR to tab:', tabId);
    
    // Send message with timeout
    const response = await Promise.race([
      chrome.tabs.sendMessage(tabId, { type: 'TOGGLE_SIDEBAR' }),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Timeout')), 1000)
      )
    ]);
    
    console.log('[Rewind Popup] Sidebar toggled successfully:', response);
    
    // Small delay before closing so sidebar can open
    setTimeout(() => {
      window.close();
    }, 100);
    
  } catch (error) {
    console.error('[Rewind Popup] Error toggling sidebar:', error);
    
    // Show helpful error message
    document.body.innerHTML = `
      <div style="padding: 20px; font-family: Inter, sans-serif; text-align: center;">
        <p style="color: #666; margin-bottom: 12px; font-size: 12px;">Use keyboard shortcut:</p>
        <p style="color: #333; font-weight: 600; font-size: 14px; margin-bottom: 8px;">Cmd + Shift + E</p>
        <p style="color: #999; font-size: 10px;">Or try refreshing the page</p>
      </div>
    `;
  }
});
