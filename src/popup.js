import "./main.css";
import { FORMATS, formatFilename } from "./formats.js";
import { getSettings } from "./settings-store.js";
import { localizePage, plural } from "./i18n.js";
import {
  backupsDeletedByNextSave,
  hasBookmarksPermission,
  saveBookmarkBackup,
} from "./bookmark-backups.js";

localizePage();

const limitNotice = document.getElementById("limit-notice");

document
  .getElementById("backup")
  .addEventListener("click", () => exportCurrentTabs());

document.getElementById("limit-confirm").addEventListener("click", () => {
  limitNotice.hidden = true;
  exportCurrentTabs({ confirmedDeletion: true });
});

document.getElementById("limit-cancel").addEventListener("click", () => {
  limitNotice.hidden = true;
  document.getElementById("backup").focus();
});

document.getElementById("limit-settings").addEventListener("click", () => {
  browser.runtime.openOptionsPage().catch((err) => console.error(err));
  window.close();
});

limitNotice.addEventListener("keydown", (event) => {
  if (event.key === "Escape") document.getElementById("limit-cancel").click();
});

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

async function exportCurrentTabs({ confirmedDeletion = false } = {}) {
  const [tabs, settings] = await Promise.all([
    getCurrentWindowTabs(),
    getSettings(),
  ]);
  const now = new Date();

  let toFile = settings.destination !== "bookmarks";
  if (settings.destination !== "file") {
    try {
      if (!(await hasBookmarksPermission())) {
        throw new Error("bookmark access was removed in about:addons");
      }
      if (!confirmedDeletion) {
        const doomed = await backupsDeletedByNextSave(
          settings.keepBookmarkBackups,
        );
        if (doomed.length > 0) {
          showLimitNotice(settings.keepBookmarkBackups, doomed);
          return;
        }
      }
      const skipped = await saveBookmarkBackup(tabs, now, {
        keep: settings.keepBookmarkBackups,
        folderName: settings.bookmarkFolderName,
      });
      if (skipped)
        console.warn(`Skipped ${skipped} tabs that can't be bookmarked`);
    } catch (error) {
      // Fall back to a file so the backup isn't lost.
      console.error(`Bookmark backup failed: ${error}`);
      toFile = true;
    }
  }

  if (toFile) {
    await downloadBackup(tabs, settings, now);
  } else {
    window.close();
  }
}

// Asks before a bookmark backup deletes older ones to stay within the limit.
function showLimitNotice(keep, doomed) {
  document.getElementById("limit-title").textContent = plural(
    "limitTitle",
    keep,
  );
  document.getElementById("limit-text").textContent = plural(
    "limitText",
    doomed.length,
  );

  const shown = doomed.slice(-3).reverse(); // oldest first
  const items = shown.map((backup) => {
    const item = document.createElement("li");
    item.className = "truncate";
    item.textContent = backup.title;
    item.title = backup.title;
    return item;
  });
  if (doomed.length > shown.length) {
    const more = document.createElement("li");
    more.textContent = plural("limitMore", doomed.length - shown.length);
    items.push(more);
  }
  document.getElementById("limit-list").replaceChildren(...items);

  limitNotice.hidden = false;
  document.getElementById("limit-confirm").focus();
}

async function downloadBackup(tabs, settings, now) {
  let objURL;
  try {
    const format = FORMATS[settings.format] ?? FORMATS.json;
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
