chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === 'captureTab') {
    chrome.tabs.captureVisibleTab(null, { format: 'png' }, sendResponse);
    return true;
  }
  if (msg.action === 'saveColor') {
    chrome.storage.local.get(['history'], (r) => {
      let h = r.history || [];
      h = h.filter(c => c.hex !== msg.color.hex);
      h.unshift(msg.color);
      if (h.length > 12) h = h.slice(0, 12);
      chrome.storage.local.set({ history: h, current: msg.color });
    });
  }
  if (msg.action === 'getHistory') {
    chrome.storage.local.get(['history', 'current'], sendResponse);
    return true;
  }
  if (msg.action === 'clearHistory') {
    chrome.storage.local.set({ history: [] });
  }
});
