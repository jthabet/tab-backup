import "./main.css";
import {
  deleteBookmarkBackup,
  hasBookmarksPermission,
  listBookmarkBackups,
} from "./bookmark-backups.js";

const status = document.getElementById("status");

document.getElementById("input").addEventListener("change", (event) => {
  const input = event.target;
  const file = input.files[0];
  if (!file) return;
  file
    .text()
    .then((text) => {
      const urls = parseBackup(text);
      if (urls.length === 0) {
        status.textContent = "No tabs found in this file.";
        return;
      }
      return openUrls(urls);
    })
    .catch((err) => {
      console.error(err);
      status.textContent = "Couldn't read this file.";
    })
    // Allow choosing the same file again to re-trigger the change event.
    .finally(() => {
      input.value = "";
    });
});

initBookmarkBackups();

// Opens the URLs as background tabs and reports the result.
async function openUrls(urls) {
  const results = await Promise.allSettled(
    urls.map((url) => {
      const properties = toCreateProperties(url);
      if (!properties) {
        return Promise.reject(new Error(`extensions cannot open ${url}`));
      }
      return browser.tabs.create({ ...properties, active: false });
    }),
  );
  const failed = results.filter((result) => result.status === "rejected");
  for (const { reason } of failed) console.warn(`Skipped: ${reason}`);

  const opened = results.length - failed.length;
  status.textContent =
    `Opened ${opened} ${opened === 1 ? "tab" : "tabs"}` +
    (failed.length ? `, skipped ${failed.length} that can't be opened.` : ".");
}

async function initBookmarkBackups() {
  if (!(await hasBookmarksPermission())) return;
  document.getElementById("synced").hidden = false;
  await renderBookmarkBackups();

  // Refresh when Firefox Sync brings in or removes backups.
  let timer;
  const refresh = () => {
    clearTimeout(timer);
    timer = setTimeout(renderBookmarkBackups, 300);
  };
  browser.bookmarks.onCreated.addListener(refresh);
  browser.bookmarks.onRemoved.addListener(refresh);
  browser.bookmarks.onChanged.addListener(refresh);
}

async function renderBookmarkBackups() {
  const list = document.getElementById("synced-list");
  const backups = await listBookmarkBackups();
  document.getElementById("synced-empty").hidden = backups.length > 0;
  list.hidden = backups.length === 0;

  list.replaceChildren(
    ...backups.map((backup) => {
      const item = document.createElement("li");
      item.className = "flex items-center gap-2 px-3 py-2";

      const label = document.createElement("span");
      label.className = "min-w-0 flex-1 truncate text-sm";
      label.textContent = backup.title;
      label.title = backup.title;

      const restore = document.createElement("button");
      restore.type = "button";
      restore.className =
        "h-8 cursor-pointer rounded-md border border-neutral-300 px-3 text-sm font-medium hover:bg-neutral-100 dark:border-neutral-600 dark:hover:bg-neutral-800";
      restore.textContent = "Restore";
      restore.addEventListener("click", () => openUrls(backup.urls));

      const remove = document.createElement("button");
      remove.type = "button";
      remove.className =
        "h-8 cursor-pointer rounded-md px-3 text-sm text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-100";
      remove.textContent = "Delete";
      remove.setAttribute("aria-label", `Delete ${backup.title}`);
      remove.addEventListener("click", async () => {
        if (!window.confirm(`Delete the backup "${backup.title}"?`)) return;
        await deleteBookmarkBackup(backup.id);
        await renderBookmarkBackups();
      });

      item.append(label, restore, remove);
      return item;
    }),
  );
}

// Returns the URLs in a backup. JSON backups ([{title, url}]) keep every
// entry, including about: pages and duplicates; Markdown, plain-text and
// HTML-bookmark backups only carry their http(s) links, read once each.
function parseBackup(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    // Bookmark files escape & as &amp; in hrefs, so read them as HTML.
    const links = /<a\s[^>]*href=/i.test(text)
      ? [...new DOMParser().parseFromString(text, "text/html").links]
          .map((link) => link.getAttribute("href"))
          .filter((href) => /^https?:\/\//i.test(href))
      : (text.match(/https?:\/\/[^\s"'<>]+/g) ?? []);
    return [...new Set(links)];
  }
  if (!Array.isArray(data)) return [];
  return data
    .filter((entry) => entry && typeof entry.url === "string" && entry.url)
    .map((entry) => entry.url);
}

const NEW_TAB_URLS = new Set([
  "about:newtab",
  "about:home",
  "about:privatebrowsing",
]);

// Schemes tabs.create rejects as "Illegal URL" (about:blank is the one
// allowed about: page).
const PRIVILEGED_SCHEMES =
  /^(about|chrome|resource|file|data|javascript|view-source):/i;

// Maps a saved URL to tabs.create properties, or null if it cannot be opened.
function toCreateProperties(url) {
  if (NEW_TAB_URLS.has(url)) return {}; // no url opens the default new tab page
  if (url.startsWith("about:reader?")) {
    const original = new URLSearchParams(url.slice("about:reader?".length)).get(
      "url",
    );
    return original ? { url: original, openInReaderMode: true } : null;
  }
  if (url === "about:blank") return { url };
  if (PRIVILEGED_SCHEMES.test(url)) return null;
  return { url };
}
