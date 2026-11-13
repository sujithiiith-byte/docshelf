// Clicking the toolbar icon (or pressing Alt+Shift+D) opens a DocShelf
// workspace. Every click gives a new workspace so you can have several folders
// open at once; an empty New Tab page is reused instead of leaving it behind.
const PAGE_URL = chrome.runtime.getURL('workspace.html');
const NEW_TAB = /^(chrome|edge|brave|vivaldi):\/\/(newtab|new-tab-page)\/?$/;

chrome.action.onClicked.addListener(async (tab) => {
  // `activeTab` lets us read the URL of the tab the user clicked from.
  if (tab?.id >= 0 && NEW_TAB.test(tab.url ?? '')) {
    await chrome.tabs.update(tab.id, { url: PAGE_URL });
    return;
  }
  await chrome.tabs.create({
    url: PAGE_URL,
    ...(tab?.id >= 0 ? { index: tab.index + 1, openerTabId: tab.id, windowId: tab.windowId } : {}),
  });
});
