import "./main.css";
import {
  defaultBackupTitle,
  deleteBookmarkBackup,
  hasBookmarksPermission,
  listBookmarkBackups,
  renameBookmarkBackup,
} from "./bookmark-backups.js";
import { localizePage, plural, t } from "./i18n.js";
import {
  NEW_TAB_URLS,
  displayUrl,
  parseBackup,
  toCreateProperties,
} from "./backup-parse.js";

localizePage();

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
      status.textContent = t("noTabsInFile");
      return;
    }
    await showPreview(file.name, entries);
  } catch (err) {
    console.error(err);
    status.textContent = t("cantReadFile");
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
    status.textContent = t("selectAtLeastOne");
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
    plural("tabCount", previewEntries.length),
    openCount && plural("alreadyOpenCount", openCount),
    blockedCount && plural("cantOpenCount", blockedCount),
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
  // Rows off screen skip layout, which halves the memory of a preview of
  // thousands of tabs. 53px is a row's height, until it's first shown.
  item.className =
    "[contain-intrinsic-size:auto_53px] [content-visibility:auto]";

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
    ? entry.alreadyOpen && t("alreadyOpen")
    : t("cantBeOpened");
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
  openButton.textContent = plural("openTabs", count);
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
  const result = plural("openedTabs", opened);
  // Japanese runs sentences together; the message decides the spacing.
  status.textContent = failed.length
    ? t("twoSentences", result, plural("skippedTabs", failed.length))
    : result;
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

  // Refresh when the browser's sync brings in or removes backups.
  let timer;
  const refresh = () => {
    clearTimeout(timer);
    timer = setTimeout(renderBookmarkBackups, 300);
  };
  browser.bookmarks.onCreated.addListener(refresh);
  browser.bookmarks.onRemoved.addListener(refresh);
  browser.bookmarks.onChanged.addListener(refresh);
}

// True while a backup's name is being edited, so a refresh doesn't throw
// away what the user is typing; the list is redrawn when they're done.
let renaming = false;

// Redraws the list, keeping focus on the same button of the same backup
// (`focus` overrides it: { id, action }).
async function renderBookmarkBackups(focus) {
  if (renaming) return;
  const list = document.getElementById("synced-list");
  const backups = await listBookmarkBackups();
  const active = document.activeElement;
  focus ??= list.contains(active) && {
    id: active.closest("li")?.dataset.id,
    action: active.dataset.action,
  };
  document.getElementById("synced-empty").hidden = backups.length > 0;
  list.hidden = backups.length === 0;

  list.replaceChildren(
    ...backups.map((backup) => {
      const item = document.createElement("li");
      item.className = "flex items-center gap-2 px-3 py-2";
      item.dataset.id = backup.id;

      const label = document.createElement("span");
      label.className = "flex min-w-0 flex-1 flex-col";
      const name = document.createElement("span");
      // Wraps rather than truncates, so the date and size stay readable.
      name.className = "line-clamp-2 text-sm break-words";
      name.textContent = backup.title;
      name.title = backup.title;
      label.append(name);
      // A renamed backup no longer shows its date and size in its name.
      if (backup.kept) {
        const details = document.createElement("span");
        details.className = "text-xs text-neutral-500 dark:text-neutral-400";
        details.textContent = defaultBackupTitle(backup);
        label.append(details);
      }

      const rename = document.createElement("button");
      rename.type = "button";
      rename.className =
        "h-8 cursor-pointer rounded-md px-3 text-sm text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-100";
      rename.textContent = t("rename");
      rename.setAttribute("aria-label", t("renameBackupLabel", backup.title));
      rename.addEventListener("click", () =>
        startRenaming(backup, label, rename),
      );

      const restore = document.createElement("button");
      restore.type = "button";
      restore.className =
        "h-8 cursor-pointer rounded-md border border-neutral-300 px-3 text-sm font-medium hover:bg-neutral-100 dark:border-neutral-600 dark:hover:bg-neutral-800";
      restore.textContent = t("restore");
      restore.setAttribute("aria-label", t("restoreBackupLabel", backup.title));
      restore.addEventListener("click", () =>
        showPreview(backup.title, backup.entries),
      );

      const remove = document.createElement("button");
      remove.type = "button";
      remove.className =
        "h-8 cursor-pointer rounded-md px-3 text-sm text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-100";
      remove.textContent = t("delete");
      remove.setAttribute("aria-label", t("deleteBackupLabel", backup.title));
      remove.addEventListener("click", async () => {
        if (!window.confirm(t("confirmDelete", backup.title))) return;
        await deleteBookmarkBackup(backup.id);
        await renderBookmarkBackups();
      });

      restore.dataset.action = "restore";
      rename.dataset.action = "rename";
      remove.dataset.action = "delete";
      item.append(label, restore, rename, remove);
      return item;
    }),
  );
  if (focus?.action) {
    list
      .querySelector(`li[data-id="${CSS.escape(focus.id)}"]`)
      ?.querySelector(`[data-action="${focus.action}"]`)
      ?.focus();
  }
}

// Swaps a backup's name for a text field: Enter or leaving the field saves,
// Escape cancels, and an empty name restores the default (date and size).
function startRenaming(backup, label, button) {
  renaming = true;
  const input = document.createElement("input");
  input.type = "text";
  input.value = backup.title;
  input.placeholder = defaultBackupTitle(backup);
  input.spellcheck = false;
  input.autocomplete = "off";
  input.setAttribute("aria-label", t("backupName"));
  input.className =
    "h-8 min-w-0 flex-1 rounded-md border border-neutral-300 bg-transparent px-2 text-sm focus:outline-2 focus:outline-offset-1 focus:outline-neutral-800 dark:border-neutral-600 dark:focus:outline-neutral-100";
  label.replaceWith(input);
  button.disabled = true;
  input.focus();
  input.select();

  let done = false;
  const finish = async (save) => {
    if (done) return;
    done = true;
    const name = input.value.trim();
    // Leaving the default name as it is doesn't count as renaming.
    if (save && name !== backup.title) {
      await renameBookmarkBackup(backup, name);
    }
    renaming = false;
    await renderBookmarkBackups({ id: backup.id, action: "rename" });
  };
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") finish(true);
    if (event.key === "Escape") finish(false);
  });
  input.addEventListener("blur", () => finish(true));
}
