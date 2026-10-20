import "./main.css";
import { FORMATS, formatFilename } from "./formats.js";
import { getSettings } from "./settings-store.js";

document.getElementById("backup").addEventListener("click", exportCurrentTabs);

document.getElementById("restore").addEventListener("click", () => {
  browser.tabs
    .create({ url: browser.runtime.getURL("restore.html") })
    .catch((err) => console.error(err));
  window.close();
});

document.getElementById("settings").addEventListener("click", () => {
  browser.runtime.openOptionsPage().catch((err) => console.error(err));
  window.close();
});

renderTabsList();

async function renderTabsList() {
  const list = document.getElementById("tabs-list");
  const tabs = await getCurrentWindowTabs();

  for (const tab of tabs) {
    const item = document.createElement("li");
    item.className = "truncate";
    item.title = tab.title;

    const button = document.createElement("button");
    button.type = "button";
    button.className =
      "max-w-[calc(100%-1.5rem)] cursor-pointer truncate text-left align-bottom hover:text-neutral-500 dark:hover:text-neutral-400";
    button.textContent = tab.title;
    button.addEventListener("click", () => {
      browser.tabs
        .update(tab.id, { active: true })
        .catch((err) => console.error(err));
    });

    item.append(button);
    list.append(item);
  }
}

function getCurrentWindowTabs() {
  return browser.tabs.query({ currentWindow: true });
}

async function exportCurrentTabs() {
  let objURL;
  try {
    const [tabs, settings] = await Promise.all([
      getCurrentWindowTabs(),
      getSettings(),
    ]);
    const format = FORMATS[settings.format] ?? FORMATS.json;
    const now = new Date();
    const name = formatFilename(settings.filenamePattern, now, tabs.length);

    const content = format.serialize(tabs, { folder: `Tab Backup ${name}` });
    const blob = new Blob([content], { type: format.type });
    objURL = URL.createObjectURL(blob);

    const filename = `${name}.${format.extension}`;
    const downloadId = await browser.downloads.download({
      url: objURL,
      filename,
    });
    console.log(`downloading ${downloadId}`);

    function handleChanged(delta) {
      if (delta.id !== downloadId || !delta.state) return;
      if (delta.state.current === "complete") {
        browser.downloads.onChanged.removeListener(handleChanged);
        URL.revokeObjectURL(objURL);
        window.close();
      } else if (delta.state.current === "interrupted") {
        browser.downloads.onChanged.removeListener(handleChanged);
        URL.revokeObjectURL(objURL);
      }
    }
    browser.downloads.onChanged.addListener(handleChanged);

    // The download may have finished before the listener was attached.
    const [item] = await browser.downloads.search({ id: downloadId });
    if (item && item.state !== "in_progress") {
      handleChanged({ id: downloadId, state: { current: item.state } });
    }
  } catch (error) {
    if (objURL) URL.revokeObjectURL(objURL);
    console.error(`Download failed ${error}`);
  }
}
