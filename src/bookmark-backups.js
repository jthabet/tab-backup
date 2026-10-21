// Bookmark backups: each backup is a folder of bookmarks inside a
// "Tab Backup" folder under Other Bookmarks, so Firefox Sync carries it to
// the user's other devices. Needs the optional "bookmarks" permission.

const ROOT_TITLE = "Tab Backup";
const OTHER_BOOKMARKS_ID = "unfiled_____";
const ROOT_ID_KEY = "bookmarkRootId";

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
export async function saveBookmarkBackup(tabs, date, keep) {
  const root = await getRootFolder({ create: true });
  const folder = await browser.bookmarks.create({
    parentId: root.id,
    index: 0,
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
// Each device may have created its own "Tab Backup" folder before syncing,
// so every matching folder is read.
export async function listBookmarkBackups() {
  const roots = await findRootFolders();
  const backups = [];
  for (const root of roots) {
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

export function deleteBookmarkBackup(id) {
  return browser.bookmarks.removeTree(id);
}

async function pruneBackups(keep) {
  const backups = await listBookmarkBackups();
  for (const backup of backups.slice(keep)) {
    await deleteBookmarkBackup(backup.id);
  }
}

async function findRootFolders() {
  const children = await browser.bookmarks.getChildren(OTHER_BOOKMARKS_ID);
  const roots = children.filter(
    (node) => node.type === "folder" && node.title === ROOT_TITLE,
  );
  // A renamed or moved root is still found through its saved id.
  const saved = await getSavedRoot();
  if (saved && !roots.some((root) => root.id === saved.id)) roots.push(saved);
  return roots;
}

async function getRootFolder({ create }) {
  const saved = await getSavedRoot();
  if (saved) return saved;

  const [found] = await findRootFolders();
  const root =
    found ??
    (create
      ? await browser.bookmarks.create({
          parentId: OTHER_BOOKMARKS_ID,
          title: ROOT_TITLE,
        })
      : null);
  if (root) await browser.storage.local.set({ [ROOT_ID_KEY]: root.id });
  return root;
}

async function getSavedRoot() {
  const { [ROOT_ID_KEY]: id } = await browser.storage.local.get(ROOT_ID_KEY);
  if (!id) return null;
  try {
    const [node] = await browser.bookmarks.get(id);
    return node?.type === "folder" ? node : null;
  } catch {
    return null; // deleted since
  }
}

function formatDate(date) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}
