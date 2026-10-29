// Keeps the toolbar badge set to the number of open tabs. A burst of tab
// changes (restoring a backup, or the session at startup) becomes a single
// update, since each one lists every tab.
const UPDATE_DELAY = 100; // ms
let timer;

// Tabs reported closed since the last update. Firefox can still list them:
// onRemoved fires before the tab is gone (bug 1396758).
const removed = new Set();

function scheduleUpdate() {
  clearTimeout(timer);
  timer = setTimeout(updateCount, UPDATE_DELAY);
}

async function updateCount() {
  // Tabs closed while the query runs are left for the next update.
  const gone = new Set(removed);
  removed.clear();
  try {
    const tabs = await browser.tabs.query({});
    const count = tabs.filter((tab) => !gone.has(tab.id)).length;
    await browser.action.setBadgeText({ text: count.toString() });
  } catch (err) {
    console.error(`Couldn't update the tab count: ${err}`);
  }
}

browser.tabs.onCreated.addListener(scheduleUpdate);
browser.tabs.onRemoved.addListener((tabId) => {
  removed.add(tabId);
  scheduleUpdate();
});

function init() {
  browser.action.setBadgeBackgroundColor({ color: "#008000" });
  updateCount();
}

browser.runtime.onInstalled.addListener(init);
// Chromium doesn't keep the badge across browser restarts.
browser.runtime.onStartup.addListener(init);
