// Bookmark backups: each backup is a folder of bookmarks inside a root
// folder under Other Bookmarks, so the browser's sync carries it to the
// user's other devices. Needs the optional "bookmarks" permission.
//
// The root is recognized by a marker bookmark inside it, never by its name,
// so a folder the user created with the same name is never listed, adopted
// or pruned. The marker also survives renaming, moving and syncing.

// Firefox and Chromium bookmarks never sync with each other, so each build
// has its own marker. Neither may change after release.
function markerUrl() {
  return process.env.BROWSER === "firefox"
    ? "https://addons.mozilla.org/firefox/addon/tab-backup/?src=backup-folder"
    : "https://github.com/jthabet/tab-backup?src=backup-folder";
}
const MARKER_TITLE =
  "About these backups: the oldest are deleted when you reach your limit";
// A backup renamed from the restore page holds an empty folder with this
// title, so it syncs with the backup and keeps it from being pruned on every
// device. Like the marker, it is never translated and may not change.
const KEPT_TITLE = "Renamed in Tab Backup: kept when older backups are deleted";

import { saveSettings } from "./settings-store.js";
import { language, plural, t } from "./i18n.js";

const PERMISSION = { permissions: ["bookmarks"] };

export function hasBookmarksPermission() {
  return browser.permissions.contains(PERMISSION);
}

// Must be called directly from a user action (no await before it).
export function requestBookmarksPermission() {
  return browser.permissions.request(PERMISSION);
}

// Saves the tabs as a new backup folder, newest first, then deletes the
// oldest backups beyond `keep`, leaving renamed ones. Returns how many tabs
// were skipped because they can't be bookmarked (such as about:newtab).
export async function saveBookmarkBackup(tabs, date, { keep, folderName }) {
  const root = await getOrCreateRoot(folderName);
  const folder = await browser.bookmarks.create({
    parentId: root.id,
    index: 1, // right after the marker
    title: formatDate(date),
  });

  let skipped = 0;
  for (const { title, url } of tabs) {
    try {
      await browser.bookmarks.create({
        parentId: folder.id,
        title: title || url,
        url,
      });
    } catch {
      skipped++;
    }
  }
  const saved = tabs.length - skipped;
  await browser.bookmarks.update(folder.id, {
    title: plural("backupFolderTitle", saved, formatDate(date)),
  });

  await pruneBackups(keep);
  return skipped;
}

// All backups, newest first, including ones synced from other devices.
// Each device may have created its own root before syncing, so every
// marked root is read.
export async function listBookmarkBackups() {
  const backups = [];
  for (const root of await findRoots()) {
    const [tree] = await browser.bookmarks.getSubTree(root.id);
    for (const node of tree.children ?? []) {
      if (!isFolder(node)) continue;
      const children = node.children ?? [];
      backups.push({
        id: node.id,
        title: node.title,
        dateAdded: node.dateAdded ?? 0,
        kept: children.some(isKeptFolder),
        entries: children
          .filter((child) => child.url)
          .map(({ title, url }) => ({ title, url })),
      });
    }
  }
  return backups.sort((a, b) => b.dateAdded - a.dateAdded);
}

// The backups that saving one more would delete, oldest last. Renamed
// (kept) backups are never deleted and don't count toward the limit.
export async function backupsDeletedByNextSave(keep) {
  const backups = await listPrunable();
  return backups.slice(Math.max(keep - 1, 0));
}

// The name a backup gets when it's saved: its date and number of tabs.
export function defaultBackupTitle({ dateAdded, entries }) {
  return plural(
    "backupFolderTitle",
    entries.length,
    formatDate(new Date(dateAdded)),
  );
}

// Renames a backup and keeps it from being pruned. An empty name gives it
// back its default title, and it's pruned like any other backup again.
export async function renameBookmarkBackup(backup, name) {
  const [tree] = await browser.bookmarks.getSubTree(backup.id);
  const keptFolders = (tree.children ?? []).filter(isKeptFolder);
  const title = name.trim();
  if (!title) {
    await browser.bookmarks.update(backup.id, {
      title: defaultBackupTitle(backup),
    });
    for (const folder of keptFolders) {
      await browser.bookmarks.removeTree(folder.id);
    }
    return;
  }
  await browser.bookmarks.update(backup.id, { title });
  if (keptFolders.length === 0) {
    await browser.bookmarks.create({ parentId: backup.id, title: KEPT_TITLE });
  }
}

export function deleteBookmarkBackup(id) {
  return browser.bookmarks.removeTree(id);
}

// The backup folder's current name, or null if there's none yet. It can
// differ from the setting if the user renamed the folder themselves.
export async function getBackupFolderName() {
  const [root] = await findRoots();
  return root?.title ?? null;
}

// Renames every marked root, e.g. after the folder name setting changes.
export async function renameBackupFolder(name) {
  for (const root of await findRoots()) {
    if (root.title !== name)
      await browser.bookmarks.update(root.id, { title: name });
  }
}

async function listPrunable() {
  return (await listBookmarkBackups()).filter((backup) => !backup.kept);
}

async function pruneBackups(keep) {
  const backups = await listPrunable();
  for (const backup of backups.slice(keep)) {
    await deleteBookmarkBackup(backup.id);
  }
}

// Folders that contain the marker bookmark, wherever the user moved them.
async function findRoots() {
  const markers = await browser.bookmarks.search({ url: markerUrl() });
  const parentIds = [
    ...new Set(
      markers
        .filter((marker) => marker.title === MARKER_TITLE && marker.parentId)
        .map((marker) => marker.parentId),
    ),
  ];
  if (parentIds.length === 0) return [];
  const parents = await browser.bookmarks.get(parentIds);
  return parents.filter(isFolder);
}

async function getOrCreateRoot(folderName) {
  const [existing] = await findRoots();
  if (existing) return existing;

  // Don't create a second folder that looks like one the user already has.
  const parentId = await otherBookmarksId();
  const siblings = await browser.bookmarks.getChildren(parentId);
  const taken = siblings.some(
    (node) => isFolder(node) && node.title === folderName,
  );
  const title = taken ? t("backupFolderTaken", folderName) : folderName;
  const root = await browser.bookmarks.create({ parentId, title });
  // Keep the setting in step with the name the folder actually got.
  if (title !== folderName) await saveSettings({ bookmarkFolderName: title });
  await browser.bookmarks.create({
    parentId: root.id,
    index: 0,
    title: MARKER_TITLE,
    url: markerUrl(),
  });
  return root;
}

async function otherBookmarksId() {
  if (process.env.BROWSER === "firefox") return "unfiled_____";
  // Chromium 134+ labels the top-level folders, and may hold both a local
  // and a synced (account) copy of each; prefer the synced one.
  const top = await browser.bookmarks.getChildren("0");
  const other = top.filter((node) => node.folderType === "other");
  return (other.find((node) => node.syncing) ?? other[0])?.id ?? "2";
}

function isKeptFolder(node) {
  return isFolder(node) && node.title === KEPT_TITLE;
}

// Firefox sets node.type; Chromium only leaves out url on folders.
function isFolder(node) {
  return node.type ? node.type === "folder" : !node.url;
}

function formatDate(date) {
  return new Intl.DateTimeFormat(language, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}
