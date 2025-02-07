let shadowTabs = new Map();
let connections = new Map();

// Load saved tabs on service worker startup
(async () => {
  const data = await chrome.storage.local.get("shadowTabs");
  if (data.shadowTabs) {
    shadowTabs = new Map(data.shadowTabs);
  }
})();

// Initialize
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "open-shadow-tab",
    title: "Open as Shadow Tab",
    contexts: ["link", "page"],
  });

  // Keep service worker active
  chrome.alarms.create("keepAlive", { periodInMinutes: 1 });
});

// Handle context menu clicks
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "open-shadow-tab") {
    const url = info.linkUrl || info.pageUrl;
    createShadowTab(url);
  }
});

chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'TAB_ALREADY_OPEN') {
    const infoBanner = document.createElement('div');
    infoBanner.className = 'info-banner';
    infoBanner.textContent = `Tab with URL ${message.url} is already open. Focusing on it.`;
    document.body.prepend(infoBanner);
    
    setTimeout(() => {
      infoBanner.remove();
    }, 3000);
  }
});

// Connection management
chrome.runtime.onConnect.addListener((port) => {
  if (port.name === "shadow-tab-port") {
    const tabId = port.sender.tab.id;
    connections.set(tabId, port);

    port.onDisconnect.addListener(() => {
      connections.delete(tabId);
      if (chrome.runtime.lastError) {
        console.error("Connection error:", chrome.runtime.lastError);
      }
    });

    port.onMessage.addListener(async (msg) => {
      try {
        if (!connections.has(tabId)) return;
        await handlePortMessage(port, msg);
      } catch (error) {
        console.error("Message handling error:", error);
        port.postMessage({ type: "ERROR", error: error.message });
      }
    });
  }
});

// Keep connections alive
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "keepAlive") {
    connections.forEach((port) => {
      try {
        port.postMessage({ type: "PING" });
      } catch (error) {
        console.warn("Failed to ping port:", error);
      }
    });
  }
});

// Close shadow tab and associated browser tabs
async function closeShadowTab(url) {
  try {
    // Find and close all browser tabs with this URL
    const tabs = await chrome.tabs.query({ url: url });
    await Promise.all(tabs.map((tab) => chrome.tabs.remove(tab.id)));

    // Remove from shadow tabs
    shadowTabs.delete(url);
    await chrome.storage.local.set({
      shadowTabs: Array.from(shadowTabs.entries()),
    });
    broadcastUpdate();
  } catch (error) {
    console.error("Close Shadow Tab Error:", error);
    throw error;
  }
}

// Handle port messages
async function handlePortMessage(port, message) {
  try {
    switch (message.type) {
      case "TOGGLE_SHADOW_TABS_PANEL":
        chrome.action.openPopup();
        break;
      case "PAGE_VISIBILITY_CHANGED":
        handleVisibilityChange(message);
        break;
      case "PAGE_CONTENT_RESPONSE":
        updateShadowTabContent(message);
        break;
      case "PONG":
        // Handle keepalive response
        break;
    }
  } catch (error) {
    console.error("Port message handling error:", error);
    port.postMessage({ type: "ERROR", error: error.message });
  }
}

// Handle visibility changes
function handleVisibilityChange(message) {
  try {
    if (message.hidden && shadowTabs.has(message.url)) {
      const shadowTab = shadowTabs.get(message.url);
      shadowTab.lastVisibilityChange = Date.now();
      updateShadowTab(message.url, shadowTab);
    }
  } catch (error) {
    console.error("Visibility change handling error:", error);
  }
}

// Create shadow tab
async function createShadowTab(inputUrl) {
  try {
    let finalUrl;
    try {
      if (!inputUrl.includes("://")) {
        inputUrl = "https://" + inputUrl;
      }
      const url = new URL(inputUrl);
      if (!["http:", "https:"].includes(url.protocol)) {
        throw new Error("Only HTTP and HTTPS protocols are supported");
      }
      finalUrl = url.toString();
    } catch (urlError) {
      throw new Error(`Invalid URL: ${inputUrl}`);
    }

    if (shadowTabs.has(finalUrl)) {
      chrome.runtime.sendMessage({
        type: "SHADOW_TAB_ERROR",
        error: `This URL is already in your shadow tabs: ${finalUrl}`,
      });
      throw new Error("Shadow tab already exists for this URL");
    }

    const tempTab = await chrome.tabs.create({
      url: finalUrl,
      active: false,
    });

    const tabInfo = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        chrome.tabs.onUpdated.removeListener(listener);
        reject(new Error("Page load timeout"));
      }, 30000);

      function listener(tabId, info) {
        if (tabId === tempTab.id && info.status === "complete") {
          clearTimeout(timeout);
          chrome.tabs.onUpdated.removeListener(listener);
          chrome.tabs.get(tabId).then(resolve);
        }
      }

      chrome.tabs.onUpdated.addListener(listener);
    });

    const shadowTab = {
      url: finalUrl,
      title: tabInfo.title || finalUrl,
      createdAt: Date.now(),
      lastAccessed: Date.now(),
      lastVisibilityChange: null,
    };

    shadowTabs.set(finalUrl, shadowTab);
    await chrome.storage.local.set({
      shadowTabs: Array.from(shadowTabs.entries()),
    });

    await chrome.tabs.remove(tempTab.id);

    broadcastUpdate();
    return shadowTab;
  } catch (error) {
    console.error("Shadow Tab Creation Error:", error);
    broadcastError(error.message);
    throw error;
  }
}

// Show shadow tab (reloads existing tabs instead of creating new ones)
async function showShadowTab(url) {
  try {
    const tab = shadowTabs.get(url);
    if (!tab) {
      throw new Error("Shadow tab not found");
    }

    // Check for existing browser tabs with the same URL
    const existingTabs = await chrome.tabs.query({
      url: url,
      currentWindow: false, // Check all windows
    });

    if (existingTabs.length > 0) {
      // Focus on the existing tab
      const existingTab = existingTabs[0];
      await chrome.windows.update(existingTab.windowId, { focused: true });
      await chrome.tabs.update(existingTab.id, { active: true });

      // Notify the user that the tab is already open
      chrome.runtime.sendMessage({
        type: "TAB_ALREADY_OPEN",
        url: url,
      });
    } else {
      // Open new tab if none exists
      await chrome.tabs.create({
        url: url,
        active: true,
      });
    }

    // Update last accessed time in shadow tab
    tab.lastAccessed = Date.now();
    updateShadowTab(url, tab);
  } catch (error) {
    console.error("Show Shadow Tab Error:", error);
    throw error;
  }
}

// Update shadow tab
async function updateShadowTab(url, updates) {
  try {
    const tab = shadowTabs.get(url);
    if (tab) {
      Object.assign(tab, updates);
      await chrome.storage.local.set({
        shadowTabs: Array.from(shadowTabs.entries()),
      });
      broadcastUpdate();
    }
  } catch (error) {
    console.error("Update Shadow Tab Error:", error);
  }
}

// Update shadow tab content
function updateShadowTabContent(message) {
  if (shadowTabs.has(message.content.url)) {
    const tab = shadowTabs.get(message.content.url);
    tab.title = message.content.title;
    tab.lastUpdated = message.content.timestamp;
    updateShadowTab(message.content.url, tab);
  }
}

// Broadcast updates
function broadcastUpdate() {
  chrome.runtime.sendMessage({
    type: "SHADOW_TABS_UPDATED",
    shadowTabs: Array.from(shadowTabs.entries()),
  });
}

// Broadcast errors
function broadcastError(error) {
  chrome.runtime.sendMessage({
    type: "SHADOW_TAB_ERROR",
    error: error,
  });
}

// Handle messages from popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.type) {
    case "GET_SHADOW_TABS":
      sendResponse({ shadowTabs: Array.from(shadowTabs.entries()) });
      break;
    case "OPEN_SHADOW_TAB":
      showShadowTab(message.url);
      break;
    case "CLOSE_SHADOW_TAB":
      closeShadowTab(message.url);
      break;
    case "CREATE_SHADOW_TAB":
      createShadowTab(message.url);
      break;
  }
  return true;
});

// Clean up on tab removal
chrome.tabs.onRemoved.addListener((tabId) => {
  if (connections.has(tabId)) {
    connections.delete(tabId);
  }
});