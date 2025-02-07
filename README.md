# Shadow-Tab -  is a Chrome extension that allows users to run websites in the background without cluttering the tab bar. Instead of traditional open tabs, the pages stay active but remain hidden.

Core Functionality:
Open a webpage as a Shadow Tab


Users can right-click a link and select “Open in Shadow Tab”, or use a keyboard shortcut.
The tab will not appear in the tab bar but will remain active in the background.
Access & Manage Hidden Tabs


A floating panel or a popup UI (accessible via a button or hotkey) allows users to view & manage hidden tabs.
Users can bring a Shadow Tab back to the foreground when needed.
Auto-refresh & Background Execution


Shadow Tabs remain fully functional in the background.
Can set auto-refresh intervals (e.g., refresh every 5 mins).
Session Persistence


Shadow Tabs persist even after Chrome restarts.
Uses IndexedDB or Chrome Storage API to restore Shadow Tabs after a browser restart.
Privacy & Security


Uses Chrome's offscreen document API to run tabs in a low-memory mode.
Protects privacy—Shadow Tabs are not indexed in history.
