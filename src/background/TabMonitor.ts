/**
 * TabMonitor - Tracks page visits and dwell time for automatic indexing
 */

export interface TabInfo {
  url: string;
  title: string;
  tabId: number;
  startTime: number;
  dwellTime: number;
  isActive: boolean;
}

export interface TabMonitorConfig {
  excludedProtocols: string[];
  excludedDomains: string[];
}

const DEFAULT_CONFIG: TabMonitorConfig = {
  excludedProtocols: ['chrome:', 'chrome-extension:', 'about:', 'edge:', 'data:', 'file:'],
  excludedDomains: [],
};

export type IndexTriggerCallback = (tabInfo: TabInfo) => Promise<void>;

/**
 * TabMonitor class for tracking page visits and dwell time
 */
export class TabMonitor {
  private config: TabMonitorConfig;
  private tabs: Map<number, TabInfo> = new Map();
  private activeTabId: number | null = null;
  private onIndexTrigger: IndexTriggerCallback | null = null;

  constructor(config: Partial<TabMonitorConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Initialize the tab monitor
   */
  async initialize(onIndexTrigger: IndexTriggerCallback): Promise<void> {
    console.log('[TabMonitor] Initializing...');

    this.onIndexTrigger = onIndexTrigger;

    // Set up event listeners
    this._setupListeners();

    // Get currently active tab
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (activeTab && activeTab.id) {
      this.activeTabId = activeTab.id;
    }

    console.log('[TabMonitor] Initialized successfully - pages will be indexed on load');
  }

  /**
   * Set up Chrome API event listeners
   */
  private _setupListeners(): void {
    // Listen for tab updates (page loads, URL changes)
    chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
      this._handleTabUpdated(tabId, changeInfo, tab);
    });

    // Listen for tab activation (user switches tabs)
    chrome.tabs.onActivated.addListener((activeInfo) => {
      this._handleTabActivated(activeInfo);
    });

    // Listen for tab removal (user closes tab)
    chrome.tabs.onRemoved.addListener((tabId) => {
      this._handleTabRemoved(tabId);
    });

    // Listen for window focus changes
    chrome.windows.onFocusChanged.addListener((windowId) => {
      this._handleWindowFocusChanged(windowId);
    });

    console.log('[TabMonitor] Event listeners set up');
  }

  /**
   * Handle tab updates
   */
  private _handleTabUpdated(
    tabId: number,
    changeInfo: chrome.tabs.TabChangeInfo,
    tab: chrome.tabs.Tab
  ): void {
    // Only process when page has finished loading
    if (changeInfo.status === 'complete' && tab.url) {
      // Check if URL should be excluded
      if (this._shouldExcludeUrl(tab.url)) {
        console.log('[TabMonitor] Excluding URL:', tab.url);
        this._removeTab(tabId);
        return;
      }

      // Check if this is a navigation to a new URL in existing tab
      const existingTab = this.tabs.get(tabId);
      if (existingTab && existingTab.url !== tab.url) {
        // URL changed - trigger indexing for old page
        const dwellTime = Math.floor((Date.now() - existingTab.startTime) / 1000);
        console.log(
          '[TabMonitor] URL changed, indexing previous page:',
          existingTab.url,
          'Dwell time:', dwellTime + 's'
        );
        existingTab.dwellTime = dwellTime;
        this._triggerIndexing(existingTab);
        // Remove old tab info
        this._removeTab(tabId);
      }

      // Create or update tab info
      const isActive = tabId === this.activeTabId;
      const tabInfo: TabInfo = {
        url: tab.url,
        title: tab.title || '',
        tabId,
        startTime: Date.now(),
        dwellTime: 0,
        isActive,
      };
      
      this.tabs.set(tabId, tabInfo);

      console.log('[TabMonitor] Tab loaded:', { tabId, url: tab.url, isActive });
      
      // 🎯 NEW: Trigger indexing immediately on page load
      console.log('[TabMonitor] ⚡ Triggering immediate indexing:', tab.url);
      this._triggerIndexing(tabInfo);
    }
  }

  /**
   * Handle tab activation (user switches to a different tab)
   */
  private _handleTabActivated(activeInfo: chrome.tabs.TabActiveInfo): void {
    const { tabId } = activeInfo;

    // Deactivate previous active tab
    if (this.activeTabId !== null && this.tabs.has(this.activeTabId)) {
      const prevTab = this.tabs.get(this.activeTabId)!;
      prevTab.isActive = false;
      console.log('[TabMonitor] Tab deactivated:', this.activeTabId);
    }

    // Activate new tab
    this.activeTabId = tabId;
    if (this.tabs.has(tabId)) {
      const tab = this.tabs.get(tabId)!;
      tab.isActive = true;
      console.log('[TabMonitor] Tab activated:', tabId);
    }
  }

  /**
   * Handle tab removal (user closes tab)
   */
  private _handleTabRemoved(tabId: number): void {
    const tab = this.tabs.get(tabId);
    if (tab) {
      // No need to trigger indexing on close - already indexed on page load
      this._removeTab(tabId);
    }

    if (this.activeTabId === tabId) {
      this.activeTabId = null;
    }
  }

  /**
   * Handle window focus changes
   */
  private _handleWindowFocusChanged(windowId: number): void {
    if (windowId === chrome.windows.WINDOW_ID_NONE) {
      // Browser lost focus - deactivate all tabs
      console.log('[TabMonitor] Browser lost focus');
      this.tabs.forEach((tab) => {
        tab.isActive = false;
      });
    } else {
      // Browser gained focus - reactivate current tab
      console.log('[TabMonitor] Browser gained focus');
      if (this.activeTabId !== null && this.tabs.has(this.activeTabId)) {
        this.tabs.get(this.activeTabId)!.isActive = true;
      }
    }
  }


  /**
   * Check if URL should be excluded from indexing
   */
  private _shouldExcludeUrl(url: string): boolean {
    try {
      const urlObj = new URL(url);

      // Check protocol
      if (this.config.excludedProtocols.some((proto) => url.startsWith(proto))) {
        return true;
      }

      // Check domain
      if (this.config.excludedDomains.some((domain) => urlObj.hostname.includes(domain))) {
        return true;
      }

      return false;
    } catch (error) {
      // Invalid URL
      return true;
    }
  }

  /**
   * Trigger indexing for a tab
   */
  private _triggerIndexing(tabInfo: TabInfo): void {
    if (this.onIndexTrigger) {
      this.onIndexTrigger({ ...tabInfo }).catch((error) => {
        console.error('[TabMonitor] Index trigger failed:', error);
      });
    }
  }

  /**
   * Remove tab from tracking
   */
  private _removeTab(tabId: number): void {
    this.tabs.delete(tabId);
  }

  /**
   * Get current tabs being tracked
   */
  getTabs(): TabInfo[] {
    return Array.from(this.tabs.values());
  }

  /**
   * Get active tab info
   */
  getActiveTab(): TabInfo | null {
    if (this.activeTabId !== null && this.tabs.has(this.activeTabId)) {
      return this.tabs.get(this.activeTabId)!;
    }
    return null;
  }

  /**
   * Stop monitoring
   */
  stop(): void {
    this.tabs.clear();
    console.log('[TabMonitor] Stopped');
  }
}
