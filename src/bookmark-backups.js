// Bookmark backups: each backup is a folder of bookmarks inside a root
// folder under Other Bookmarks, so Firefox Sync carries it to the user's
// other devices. Needs the optional "bookmarks" permission.
//
// The root is recognized by a marker bookmark inside it, never by its name,
// so a folder the user created with the same name is never listed, adopted
// or pruned. The marker also survives renaming, moving and syncing.

const OTHER_BOOKMARKS_ID = "unfiled_____";
const MARKER_URL =
  "https://addons.mozilla.org/firefox/addon/tab-backup/?src=backup-folder";
const MARKER_TITLE =
  "About these backups: the oldest are deleted when you reach your limit";

const PERMISSION = { permissions: ["bookmarks"] };

export function hasBookmarksPermission() {
  return browser.permissions.contains(PERMISSION);
}

// Must be called directly from a user action (no await before it).
export function requestBookmarksPermission() {
  return browser.permissions.request(PERMISSION);
}

// Saves the tabs as a new backup folder, newest first, then deletes the
// oldest backups beyond `keep`. Returns how many tabs were skipped because
// they can't be bookmarked (such as about:newtab).
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
    title: `${formatDate(date)} · ${saved} ${saved === 1 ? "tab" : "tabs"}`,
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
      if (node.type !== "folder") continue;
      backups.push({
        id: node.id,
        title: node.title,
        dateAdded: node.dateAdded ?? 0,
        entries: (node.children ?? [])
          .filter((child) => child.url)
          .map(({ title, url }) => ({ title, url })),
      });
    }
  }
  return backups.sort((a, b) => b.dateAdded - a.dateAdded);
}

// The backups that saving one more would delete, oldest last.
export async function backupsDeletedByNextSave(keep) {
  const backups = await listBookmarkBackups();
  return backups.slice(Math.max(keep - 1, 0));
}

export function deleteBookmarkBackup(id) {
  return browser.bookmarks.removeTree(id);
}

// Renames every marked root, e.g. after the folder name setting changes.
export async function renameBackupFolder(name) {
  for (const root of await findRoots()) {
    if (root.title !== name)
      await browser.bookmarks.update(root.id, { title: name });
  }
}

async function pruneBackups(keep) {
  const backups = await listBookmarkBackups();
  for (const backup of backups.slice(keep)) {
    await deleteBookmarkBackup(backup.id);
  }
}

// Folders that contain the marker bookmark, wherever the user moved them.
async function findRoots() {
  const markers = await browser.bookmarks.search({ url: MARKER_URL });
  const parentIds = [
    ...new Set(
      markers
        .filter((marker) => marker.title === MARKER_TITLE && marker.parentId)
        .map((marker) => marker.parentId),
    ),
  ];
  if (parentIds.length === 0) return [];
  const parents = await browser.bookmarks.get(parentIds);
  return parents.filter((node) => node.type === "folder");
}

async function getOrCreateRoot(folderName) {
  const [existing] = await findRoots();
  if (existing) return existing;

  // Don't create a second folder that looks like one the user already has.
  const siblings = await browser.bookmarks.getChildren(OTHER_BOOKMARKS_ID);
  const taken = siblings.some(
    (node) => node.type === "folder" && node.title === folderName,
  );
  const root = await browser.bookmarks.create({
    parentId: OTHER_BOOKMARKS_ID,
    title: taken ? `${folderName} (backups)` : folderName,
  });
  await browser.bookmarks.create({
    parentId: root.id,
    index: 0,
    title: MARKER_TITLE,
    url: MARKER_URL,
  });
  return root;
}

function formatDate(date) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}
