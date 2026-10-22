import "./main.css";
import {
  deleteBookmarkBackup,
  hasBookmarksPermission,
  listBookmarkBackups,
} from "./bookmark-backups.js";

const status = document.getElementById("status");
const startView = document.getElementById("start-view");
const preview = document.getElementById("preview");
const previewList = document.getElementById("preview-list");
const openButton = document.getElementById("preview-open");
const skipOpen = document.getElementById("skip-open");

// The backup shown in the preview: [{ title, url, openable, alreadyOpen, checkbox }]
let previewEntries = [];

document.getElementById("input").addEventListener("change", async (event) => {
  const input = event.target;
  const file = input.files[0];
  if (!file) return;
  try {
    const entries = parseBackup(await file.text());
    if (entries.length === 0) {
      status.textContent = "No tabs found in this file.";
      return;
    }
    await showPreview(file.name, entries);
  } catch (err) {
    console.error(err);
    status.textContent = "Couldn't read this file.";
  } finally {
    // Allow choosing the same file again to re-trigger the change event.
    input.value = "";
  }
});

document.getElementById("select-all").addEventListener("click", () => {
  for (const entry of selectable()) entry.checkbox.checked = true;
  updateOpenButton();
});

document.getElementById("select-none").addEventListener("click", () => {
  for (const entry of selectable()) entry.checkbox.checked = false;
  updateOpenButton();
});

skipOpen.addEventListener("change", () => {
  for (const entry of selectable()) {
    if (entry.alreadyOpen) entry.checkbox.checked = !skipOpen.checked;
  }
  updateOpenButton();
});

document.getElementById("preview-cancel").addEventListener("click", () => {
  hidePreview();
  status.textContent = "";
});

openButton.addEventListener("click", async () => {
  const urls = selectable()
    .filter((entry) => entry.checkbox.checked)
    .map((entry) => entry.url);
  if (urls.length === 0) {
    status.textContent = "Select at least one tab to open.";
    return;
  }
  hidePreview();
  await openUrls(urls);
});

initBookmarkBackups();

async function showPreview(title, entries) {
  const openTabs = await browser.tabs.query({});
  const openTabUrls = new Set(openTabs.map((tab) => tab.url));

  previewEntries = entries.map(({ title, url }) => ({
    title: title || url,
    url,
    openable: toCreateProperties(url) !== null,
    // New tab pages are never treated as duplicates.
    alreadyOpen: !NEW_TAB_URLS.has(url) && openTabUrls.has(url),
  }));

  previewList.replaceChildren(...previewEntries.map(renderPreviewRow));

  const openCount = previewEntries.filter((e) => e.alreadyOpen).length;
  const blockedCount = previewEntries.filter((e) => !e.openable).length;
  document.getElementById("preview-title").textContent = title;
  document.getElementById("preview-summary").textContent = [
    plural(previewEntries.length, "tab"),
    openCount && `${openCount} already open`,
    blockedCount && `${blockedCount} can't be opened`,
  ]
    .filter(Boolean)
    .join(" · ");
  document.getElementById("skip-open-label").hidden = openCount === 0;
  skipOpen.checked = true;

  status.textContent = "";
  startView.hidden = true;
  preview.hidden = false;
  updateOpenButton();
  openButton.focus();
}

function renderPreviewRow(entry) {
  const item = document.createElement("li");

  const row = document.createElement("label");
  row.className = entry.openable
    ? "flex cursor-pointer items-center gap-3 px-3 py-2 hover:bg-neutral-50 dark:hover:bg-neutral-800"
    : "flex items-center gap-3 px-3 py-2 text-neutral-400 dark:text-neutral-500";

  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.className = "shrink-0 accent-neutral-800 dark:accent-neutral-100";
  if (entry.openable) {
    checkbox.checked = !entry.alreadyOpen;
    checkbox.addEventListener("change", updateOpenButton);
    entry.checkbox = checkbox;
  } else {
    // Keeps the text aligned with the other rows; there's nothing to toggle.
    checkbox.classList.add("invisible");
    checkbox.setAttribute("aria-hidden", "true");
  }

  const text = document.createElement("span");
  text.className = "flex min-w-0 flex-1 flex-col";
  const title = document.createElement("span");
  title.className = "truncate text-sm";
  title.textContent = entry.title;
  title.title = entry.title;
  const url = document.createElement("span");
  url.className = "truncate text-xs text-neutral-500 dark:text-neutral-400";
  url.textContent = displayUrl(entry.url);
  url.title = entry.url;
  text.append(title, url);

  row.append(checkbox, text);

  const note = entry.openable
    ? entry.alreadyOpen && "Already open"
    : "Can't be opened";
  if (note) {
    const badge = document.createElement("span");
    badge.className = "shrink-0 text-xs text-neutral-500 dark:text-neutral-400";
    badge.textContent = note;
    row.append(badge);
  }

  item.append(row);
  return item;
}

function selectable() {
  return previewEntries.filter((entry) => entry.openable);
}

function updateOpenButton() {
  const count = selectable().filter((entry) => entry.checkbox.checked).length;
  openButton.textContent = `Open ${plural(count, "tab")}`;
}

function hidePreview() {
  preview.hidden = true;
  startView.hidden = false;
  previewEntries = [];
  previewList.replaceChildren();
}

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
    `Opened ${plural(opened, "tab")}` +
    (failed.length ? `, skipped ${failed.length} that can't be opened.` : ".");
}

async function initBookmarkBackups() {
  if (!(await hasBookmarksPermission())) {
    // Show the backups as soon as access is granted in settings.
    const onAdded = ({ permissions = [] }) => {
      if (!permissions.includes("bookmarks")) return;
      browser.permissions.onAdded.removeListener(onAdded);
      initBookmarkBackups();
    };
    browser.permissions.onAdded.addListener(onAdded);
    return;
  }
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
      restore.textContent = "Restore…";
      restore.setAttribute("aria-label", `Restore ${backup.title}`);
      restore.addEventListener("click", () =>
        showPreview(backup.title, backup.entries),
      );

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

// Returns the tabs in a backup as [{ title, url }]. JSON backups keep every
// entry, including about: pages and duplicates. Markdown, plain-text and
// HTML-bookmark backups carry only their http(s) links, read once each,
// with the link text as the title where there is one.
function parseBackup(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return dedupe(
      /<a\s[^>]*href=/i.test(text)
        ? parseHtmlLinks(text)
        : parseTextLinks(text),
    );
  }
  if (!Array.isArray(data)) return [];
  return data
    .filter((entry) => entry && typeof entry.url === "string" && entry.url)
    .map((entry) => ({
      title: typeof entry.title === "string" ? entry.title : "",
      url: entry.url,
    }));
}

// Bookmark files escape & as &amp; in hrefs, so read them as HTML.
function parseHtmlLinks(text) {
  return [...new DOMParser().parseFromString(text, "text/html").links]
    .map((link) => ({
      title: link.textContent.trim(),
      url: link.getAttribute("href"),
    }))
    .filter(({ url }) => /^https?:\/\//i.test(url));
}

// Markdown links ([title](<url>) or [title](url)) first, then bare URLs in
// the rest of the text (plain-text backups have one URL per line).
function parseTextLinks(text) {
  const entries = [];
  const markdownLink = /\[((?:\\.|[^\]\\])*)\]\((?:<([^>]+)>|([^\s)]+))\)/g;
  for (const [, title, angled, plain] of text.matchAll(markdownLink)) {
    const url = angled ?? plain;
    if (/^https?:\/\//i.test(url)) {
      entries.push({ title: title.replace(/\\(.)/g, "$1"), url });
    }
  }
  const rest = text.replace(markdownLink, " ");
  for (const url of rest.match(/https?:\/\/[^\s"'<>]+/g) ?? []) {
    entries.push({ title: "", url });
  }
  return entries;
}

function dedupe(entries) {
  const seen = new Map();
  for (const entry of entries) {
    if (!seen.has(entry.url)) seen.set(entry.url, entry);
  }
  return [...seen.values()];
}

function displayUrl(url) {
  try {
    const { host, pathname } = new URL(url);
    return host ? host + (pathname === "/" ? "" : pathname) : url;
  } catch {
    return url;
  }
}

function plural(count, word) {
  return `${count} ${count === 1 ? word : `${word}s`}`;
}

const NEW_TAB_URLS = new Set([
  "about:newtab",
  "about:home",
  "about:privatebrowsing",
  "chrome://newtab/",
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
    if (!original) return null;
    // Chromium has no Reader View and rejects unknown properties.
    return process.env.BROWSER === "firefox"
      ? { url: original, openInReaderMode: true }
      : { url: original };
  }
  if (url === "about:blank") return { url };
  if (PRIVILEGED_SCHEMES.test(url)) return null;
  return { url };
}
