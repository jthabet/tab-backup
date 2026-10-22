async function updateCount(tabId, isOnRemoved) {
  try {
    const tabs = await browser.tabs.query({});
    let length = tabs.length;

    // onRemoved fires too early and the count is one too many.
    // see https://bugzilla.mozilla.org/show_bug.cgi?id=1396758
    if (isOnRemoved && tabId && tabs.some((t) => t.id === tabId)) {
      length--;
    }

    await browser.action.setBadgeText({ text: length.toString() });
    await browser.action.setBadgeBackgroundColor({ color: "#008000" });
  } catch (err) {
    console.error(`Couldn't update the tab count: ${err}`);
  }
}

browser.tabs.onRemoved.addListener((tabId) => {
  updateCount(tabId, true);
});
browser.tabs.onCreated.addListener(() => {
  updateCount();
});

function handleInstalled() {
  updateCount();
}

browser.runtime.onInstalled.addListener(handleInstalled);
// Chromium doesn't keep the badge across browser restarts.
browser.runtime.onStartup.addListener(handleInstalled);
