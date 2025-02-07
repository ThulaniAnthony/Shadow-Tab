// contentScript.js
let extensionConnected = false;
let port = null;
let extensionContextInvalidated = false;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 3;

// Event listeners as named functions
const onKeyDown = (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key === "S") {
    event.preventDefault();
    if (canCommunicate()) {
      try {
        port.postMessage({ type: "TOGGLE_SHADOW_TABS_PANEL" });
      } catch (error) {
        handleError(error);
      }
    }
  }
};

const onVisibilityChange = () => {
  if (canCommunicate() && document.hidden) {
    try {
      port.postMessage({
        type: "PAGE_VISIBILITY_CHANGED",
        hidden: true,
        url: location.href
      });
    } catch (error) {
      handleError(error);
    }
  }
};

// Helper functions
const canCommunicate = () => {
  return !extensionContextInvalidated && extensionConnected && port?.sender;
};

const handleError = (error) => {
  console.warn("Communication error:", error);
  if (isContextInvalid(error)) {
    console.error("Extension context invalidated");
    performCleanup();
    showReloadBanner();
  } else {
    attemptReconnect();
  }
};

const isContextInvalid = (error) => {
  return error.message?.includes("Extension context invalidated") || 
         error.message?.includes("Receiving end does not exist");
};

const performCleanup = () => {
  extensionContextInvalidated = true;
  document.removeEventListener("keydown", onKeyDown);
  document.removeEventListener("visibilitychange", onVisibilityChange);
  if (port) {
    port.disconnect();
    port = null;
  }
  extensionConnected = false;
};

const attemptReconnect = () => {
  if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
    reconnectAttempts++;
    setTimeout(initializeConnection, 1000);
  } else {
    showReloadBanner();
    performCleanup();
  }
};

const initializeConnection = () => {
  if (extensionContextInvalidated) return;

  try {
    port = chrome.runtime.connect({ name: "shadow-tab-port" });
    reconnectAttempts = 0;

    port.onDisconnect.addListener(() => {
      extensionConnected = false;
      if (!chrome.runtime?.id) {
        console.error("Extension uninstalled");
        performCleanup();
      } else {
        attemptReconnect();
      }
    });

    port.onMessage.addListener(handleIncomingMessage);
    extensionConnected = true;
    console.log("Connection established");

  } catch (error) {
    handleError(error);
  }
};

const handleIncomingMessage = (message) => {
  if (extensionContextInvalidated) return;

  try {
    switch (message.type) {
      case "GET_PAGE_TITLE":
        if (canCommunicate()) {
          port.postMessage({ type: "PAGE_TITLE_RESPONSE", title: document.title });
        }
        break;

      case "REFRESH_PAGE":
        location.reload();
        break;

      case "GET_PAGE_CONTENT":
        if (canCommunicate()) {
          port.postMessage({
            type: "PAGE_CONTENT_RESPONSE",
            content: {
              title: document.title,
              url: location.href,
              favicon: getFavicon(),
              timestamp: Date.now()
            }
          });
        }
        break;

      case "UPDATE_DOM":
        const element = document.querySelector(message.selector);
        if (element) element.innerHTML = message.content;
        break;
    }
  } catch (error) {
    handleError(error);
  }
};

const getFavicon = () => {
  try {
    return document.querySelector('link[rel*="icon"]')?.href || "/favicon.ico";
  } catch {
    return "/favicon.ico";
  }
};

const showReloadBanner = () => {
  const banner = document.createElement("div");
  banner.style.cssText = `
    position: fixed;
    top: 10px;
    right: 10px;
    padding: 12px;
    background: #ff4444;
    color: white;
    border-radius: 4px;
    z-index: 9999;
    font-family: Arial;
  `;
  banner.textContent = "⚠️ Extension disconnected. Reload page to continue.";
  document.body.appendChild(banner);
};

// Initialize
document.addEventListener("keydown", onKeyDown);
document.addEventListener("visibilitychange", onVisibilityChange);
initializeConnection();