document.addEventListener('DOMContentLoaded', () => {
  const shadowTabsList = document.getElementById('shadowTabsList');
  const newTabUrl = document.getElementById('newTabUrl');
  const addNewTab = document.getElementById('addNewTab');
  const warningDiv = document.createElement('div');
  warningDiv.className = 'warning-banner';
  document.body.prepend(warningDiv);

  // Handle duplicate warnings
  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'DUPLICATE_WARNING') {
      warningDiv.textContent = `⚠️ ${message.url} is already in your shadow tabs!`;
      warningDiv.style.display = 'block';
      setTimeout(() => warningDiv.style.display = 'none', 3000);
    }
  });

  //prevents duplicate tabs
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

  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'SHADOW_TAB_ERROR') {
      const errorBanner = document.createElement('div');
      errorBanner.className = 'error-banner';
      errorBanner.textContent = message.error;
      document.body.prepend(errorBanner);
      
      setTimeout(() => {
        errorBanner.remove();
      }, 5000);
    }
  });

  function createTabElement(tab) {
    const li = document.createElement('li');
    li.className = 'tab-item';
    
    const titleSpan = document.createElement('span');
    titleSpan.className = 'tab-title';
    titleSpan.title = tab.url;
    titleSpan.textContent = tab.title || tab.url;
  
    const actionsDiv = document.createElement('div');
    actionsDiv.className = 'tab-actions';
  
    const openBtn = document.createElement('button');
    openBtn.className = 'open-btn';
    openBtn.textContent = 'Open';
    openBtn.onclick = () => {
      chrome.runtime.sendMessage({
        type: 'OPEN_SHADOW_TAB',
        url: tab.url
      });
      window.close();
    };
  
    const closeBtn = document.createElement('button');
    closeBtn.className = 'close-btn';
    closeBtn.textContent = 'Close';
    closeBtn.onclick = () => {
      chrome.runtime.sendMessage({
        type: 'CLOSE_SHADOW_TAB',
        url: tab.url
      });
      li.remove();
      updateEmptyState();
    };
  
    actionsDiv.append(openBtn, closeBtn);
    li.append(titleSpan, actionsDiv);
    return li;
  }

  function updateEmptyState() {
    if (shadowTabsList.children.length === 0) {
      const noTabs = document.createElement('div');
      noTabs.className = 'no-tabs';
      noTabs.textContent = 'No shadow tabs open';
      shadowTabsList.appendChild(noTabs);
    }
  }

  function updateTabList() {
    chrome.runtime.sendMessage({ type: 'GET_SHADOW_TABS' }, (response) => {
      shadowTabsList.innerHTML = '';
      if (response.shadowTabs && response.shadowTabs.length > 0) {
        response.shadowTabs
          .sort(([, a], [, b]) => b.lastAccessed - a.lastAccessed)
          .forEach(([url, tab]) => {
            shadowTabsList.appendChild(createTabElement(tab));
          });
      }
      updateEmptyState();
    });
  }

  addNewTab.addEventListener('click', () => {
    const url = newTabUrl.value.trim();
    if (url) {
      chrome.runtime.sendMessage({
        type: 'CREATE_SHADOW_TAB',
        url: url
      });
      newTabUrl.value = '';
    }
  });

  newTabUrl.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      addNewTab.click();
    }
  });

  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'SHADOW_TABS_UPDATED') {
      updateTabList();
    }
  });

  updateTabList();
});