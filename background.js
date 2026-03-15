chrome.action.onClicked.addListener(async (tab) => {
  // Inject content script if it hasn't been injected yet (e.g. tab was open before extension loaded)
  try {
    await chrome.tabs.sendMessage(tab.id, { action: "toggle" });
  } catch {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["content.js"],
    });
    await chrome.scripting.insertCSS({
      target: { tabId: tab.id },
      files: ["content.css"],
    });
    await chrome.tabs.sendMessage(tab.id, { action: "toggle" });
  }
});
