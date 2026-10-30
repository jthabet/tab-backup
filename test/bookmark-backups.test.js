import { describe, test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { installBrowser } from "./fake-browser.js";

// The modules read `browser` (i18n reads its language) when they load.
installBrowser();
const backups = await import("../src/bookmark-backups.js");
const { DEFAULT_SETTINGS } = await import("../src/settings-store.js");

const TABS = [
  { title: "Go", url: "https://go.dev/" },
  { title: "GitHub", url: "https://github.com/" },
  { title: "New Tab", url: "about:newtab" }, // browsers won't bookmark this
];
const OPTIONS = {
  keep: DEFAULT_SETTINGS.keepBookmarkBackups,
  folderName: DEFAULT_SETTINGS.bookmarkFolderName,
};
const date = (day) => new Date(2026, 9, day, 12, 0);

// Each browser's own marker; changing either would orphan existing backups.
const MARKER_URLS = {
  firefox:
    "https://addons.mozilla.org/firefox/addon/tab-backup/?src=backup-folder",
  chrome: "https://github.com/jthabet/tab-backup?src=backup-folder",
};

// The same behaviour must hold for both bookmark trees.
for (const target of ["firefox", "chrome"]) {
  const otherBookmarks = target === "firefox" ? "unfiled_____" : "2";

  describe(`bookmark backups (${target})`, () => {
    let browser;
    beforeEach(() => {
      browser = installBrowser({ target });
    });

    const rootId = () =>
      browser.bookmarks.nodes
        .get(otherBookmarks)
        .childIds.find(
          (id) => browser.bookmarks.nodes.get(id).childIds?.length,
        );

    test("the first backup creates a marked folder in Other Bookmarks", async () => {
      const skipped = await backups.saveBookmarkBackup(TABS, date(1), OPTIONS);
      assert.equal(skipped, 1);

      assert.deepEqual(browser.bookmarks.titles(otherBookmarks), [
        "Tab Backup",
      ]);
      const [marker, backup] = browser.bookmarks.titles(rootId());
      assert.match(marker, /^About these backups/);
      assert.match(backup, /· 2 tabs$/);
      const markers = await browser.bookmarks.search({
        url: MARKER_URLS[target],
      });
      assert.equal(markers.length, 1);

      const [listed] = await backups.listBookmarkBackups();
      assert.equal(listed.title, backup);
      assert.deepEqual(listed.entries, TABS.slice(0, 2));
      assert.equal(await backups.getBackupFolderName(), "Tab Backup");
    });

    test("backups are listed newest first, and later saves reuse the folder", async () => {
      await backups.saveBookmarkBackup(TABS.slice(0, 1), date(1), OPTIONS);
      await backups.saveBookmarkBackup(TABS.slice(0, 2), date(2), OPTIONS);
      assert.deepEqual(browser.bookmarks.titles(otherBookmarks), [
        "Tab Backup",
      ]);
      const listed = await backups.listBookmarkBackups();
      assert.deepEqual(
        listed.map((b) => b.entries.length),
        [2, 1],
      );
    });

    test("saving beyond the limit deletes the oldest, after warning which", async () => {
      const keep = { ...OPTIONS, keep: 2 };
      await backups.saveBookmarkBackup(TABS.slice(0, 1), date(1), keep);
      await backups.saveBookmarkBackup(TABS.slice(0, 2), date(2), keep);
      assert.deepEqual(await backups.backupsDeletedByNextSave(5), []);

      const doomed = await backups.backupsDeletedByNextSave(2);
      assert.deepEqual(
        doomed.map((b) => b.entries.length),
        [1],
      );

      await backups.saveBookmarkBackup(TABS, date(3), keep);
      const listed = await backups.listBookmarkBackups();
      assert.equal(listed.length, 2);
      assert.ok(!listed.some((b) => b.id === doomed[0].id));
    });

    test("a folder the user made with the same name is never used or listed", async () => {
      const mine = await browser.bookmarks.create({
        parentId: otherBookmarks,
        title: "Tab Backup",
      });
      await browser.bookmarks.create({
        parentId: mine.id,
        title: "Mine",
        url: "https://mine.example/",
      });

      await backups.saveBookmarkBackup(TABS, date(1), OPTIONS);
      assert.deepEqual(browser.bookmarks.titles(otherBookmarks), [
        "Tab Backup",
        "Tab Backup (backups)",
      ]);
      assert.deepEqual(browser.bookmarks.titles(mine.id), ["Mine"]);
      assert.equal(
        (await browser.storage.sync.get({})).bookmarkFolderName,
        "Tab Backup (backups)",
      );
      assert.equal(await backups.getBackupFolderName(), "Tab Backup (backups)");
      assert.equal((await backups.listBookmarkBackups()).length, 1);
    });

    test("a renamed backup folder is still found by its marker", async () => {
      await backups.saveBookmarkBackup(TABS, date(1), OPTIONS);
      await browser.bookmarks.update(rootId(), { title: "My backups" });

      assert.equal(await backups.getBackupFolderName(), "My backups");
      await backups.saveBookmarkBackup(TABS, date(2), OPTIONS);
      assert.equal((await backups.listBookmarkBackups()).length, 2);
      assert.deepEqual(browser.bookmarks.titles(otherBookmarks), [
        "My backups",
      ]);
    });

    test("renameBackupFolder renames the marked folder only", async () => {
      await browser.bookmarks.create({
        parentId: otherBookmarks,
        title: "Elsewhere",
      });
      await backups.saveBookmarkBackup(TABS, date(1), OPTIONS);
      await backups.renameBackupFolder("Sauvegardes");
      assert.deepEqual(browser.bookmarks.titles(otherBookmarks), [
        "Elsewhere",
        "Sauvegardes",
      ]);
    });

    test("deleting a backup removes only that backup", async () => {
      await backups.saveBookmarkBackup(TABS.slice(0, 1), date(1), OPTIONS);
      await backups.saveBookmarkBackup(TABS.slice(0, 2), date(2), OPTIONS);
      const [newest, oldest] = await backups.listBookmarkBackups();
      await backups.deleteBookmarkBackup(oldest.id);
      assert.deepEqual(
        (await backups.listBookmarkBackups()).map((b) => b.id),
        [newest.id],
      );
    });

    test("a renamed backup is never pruned and doesn't count toward the limit", async () => {
      const keep = { ...OPTIONS, keep: 2 };
      await backups.saveBookmarkBackup(TABS.slice(0, 1), date(1), keep);
      await backups.saveBookmarkBackup(TABS.slice(0, 2), date(2), keep);
      const [, oldest] = await backups.listBookmarkBackups();
      await backups.renameBookmarkBackup(oldest, "  Trip research ");

      const [, renamed] = await backups.listBookmarkBackups();
      assert.equal(renamed.title, "Trip research");
      assert.equal(renamed.kept, true);
      assert.deepEqual(renamed.entries, TABS.slice(0, 1));
      // Only one backup counts toward the limit of 2, so nothing is deleted.
      assert.deepEqual(await backups.backupsDeletedByNextSave(2), []);

      await backups.saveBookmarkBackup(TABS, date(3), keep);
      await backups.saveBookmarkBackup(TABS, date(4), keep);
      const listed = await backups.listBookmarkBackups();
      assert.equal(listed.length, 3);
      assert.equal(listed.at(-1).title, "Trip research");

      // Renaming again doesn't add a second keep marker.
      await backups.renameBookmarkBackup(renamed, "Trip");
      const [tree] = await browser.bookmarks.getSubTree(renamed.id);
      assert.equal(tree.children.filter((node) => !node.url).length, 1);
    });

    test("clearing a backup's name restores its default title and pruning", async () => {
      const keep = { ...OPTIONS, keep: 1 };
      await backups.saveBookmarkBackup(TABS.slice(0, 2), date(1), keep);
      const [backup] = await backups.listBookmarkBackups();
      await backups.renameBookmarkBackup(backup, "Mine");
      await backups.renameBookmarkBackup(
        (await backups.listBookmarkBackups())[0],
        "",
      );

      const [reset] = await backups.listBookmarkBackups();
      assert.equal(reset.kept, false);
      assert.equal(reset.title, backups.defaultBackupTitle(reset));
      assert.match(reset.title, /· 2 tabs$/);
      const doomed = await backups.backupsDeletedByNextSave(1);
      assert.deepEqual(
        doomed.map((b) => b.id),
        [reset.id],
      );
    });

    test("there's no folder name before the first backup", async () => {
      assert.equal(await backups.getBackupFolderName(), null);
      assert.deepEqual(await backups.listBookmarkBackups(), []);
    });
  });
}

test("in Chromium, backups go to the synced copy of Other bookmarks", async () => {
  const browser = installBrowser({ target: "chrome" });
  browser.bookmarks.addTopFolder({
    id: "20",
    title: "Other bookmarks",
    folderType: "other",
    syncing: true,
  });

  await backups.saveBookmarkBackup(TABS, date(1), OPTIONS);
  assert.deepEqual(browser.bookmarks.titles("20"), ["Tab Backup"]);
  assert.deepEqual(browser.bookmarks.titles("2"), []);
});
