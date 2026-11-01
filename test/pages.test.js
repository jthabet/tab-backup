// Clicks through the real built pages (popup, restore, settings) in a
// simulated browser page, for both the Firefox and the Chromium build.
import { describe, test, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createBrowser } from "./fake-browser.js";
import { openPage } from "./page.js";

const OPEN_TABS = [
  { title: "Go", url: "https://go.dev/" },
  { title: "GitHub", url: "https://github.com/" },
];
const sample = (ext) =>
  fs.readFileSync(
    new URL(`../samples/three-tabs.${ext}`, import.meta.url),
    "utf8",
  );

// Saves bookmark backups into a fake browser with the extension's own code,
// as earlier clicks on Back up would have.
async function seedBookmarkBackups(
  browser,
  target,
  count,
  { automatic = false } = {},
) {
  process.env.BROWSER = target;
  globalThis.browser = browser;
  const { saveBookmarkBackup } = await import("../src/bookmark-backups.js");
  for (let day = 1; day <= count; day++) {
    await saveBookmarkBackup(
      OPEN_TABS.slice(0, day),
      new Date(2026, 9, day, 9),
      {
        keep: 20,
        folderName: "Tab Backup",
        automatic,
      },
    );
  }
}

let page;
afterEach(async () => {
  await page?.close();
  page = undefined;
});

for (const target of ["firefox", "chrome"]) {
  describe(`popup (${target})`, () => {
    test("lists the window's tabs; clicking one switches to it", async () => {
      page = await openPage("popup", { target, tabs: OPEN_TABS });
      assert.deepEqual(
        page.$$("#tabs-list li").map((li) => li.textContent),
        ["Go", "GitHub"],
      );
      await page.click(page.$$("#tabs-list button")[1]);
      assert.deepEqual(page.browser.tabs.activated, [2]);
    });

    test("Back up downloads the tabs as a dated JSON file, then closes", async () => {
      page = await openPage("popup", { target, tabs: OPEN_TABS });
      await page.click("#backup");
      await page.settle();

      const [file] = await page.downloads();
      assert.match(file.filename, /^tabs-\d\d-\d\d-\d{4}_\d\d-\d\d\.json$/);
      assert.deepEqual(JSON.parse(file.contents), OPEN_TABS);
      assert.ok(page.closed);
    });

    test("Back up uses the format and file name chosen in settings", async () => {
      const browser = createBrowser({ target, tabs: OPEN_TABS });
      await browser.storage.sync.set({
        format: "markdown",
        filenamePattern: "my-{count}",
      });
      page = await openPage("popup", { target, browser });
      await page.click("#backup");
      await page.settle();

      assert.deepEqual(await page.downloads(), [
        {
          filename: "my-2.md",
          contents:
            "- [Go](<https://go.dev/>)\n- [GitHub](<https://github.com/>)\n",
        },
      ]);
    });

    test("tabs on excluded sites are marked and left out of the backup", async () => {
      const tabs = [
        ...OPEN_TABS,
        { title: "Bank", url: "https://www.bank.example/" },
      ];
      const browser = createBrowser({ target, tabs });
      await browser.storage.sync.set({
        excludedSites: ["bank.example"],
        filenamePattern: "tabs-{count}",
      });
      page = await openPage("popup", { target, browser });
      const notes = page
        .$$("#tabs-list li")
        .map((li) => li.querySelector("span")?.textContent ?? null);
      assert.deepEqual(notes, [null, null, "Not backed up"]);

      await page.click("#backup");
      await page.settle();
      const [file] = await page.downloads();
      assert.equal(file.filename, "tabs-2.json");
      assert.deepEqual(JSON.parse(file.contents), OPEN_TABS);
    });

    test("Back up is off when every tab is on an excluded site", async () => {
      const browser = createBrowser({ target, tabs: OPEN_TABS });
      await browser.storage.sync.set({
        excludedSites: ["go.dev", "github.com"],
      });
      page = await openPage("popup", { target, browser });
      assert.equal(page.$("#backup").disabled, true);
    });

    test("backing up to bookmarks saves a bookmark backup and no file", async () => {
      const browser = createBrowser({ target, tabs: OPEN_TABS });
      await browser.storage.sync.set({ destination: "bookmarks" });
      page = await openPage("popup", { target, browser });
      await page.click("#backup");
      await page.settle();

      assert.equal(browser.downloads.saved.length, 0);
      assert.deepEqual(browser.bookmarks.titles(otherBookmarks(target)), [
        "Tab Backup",
      ]);
      assert.ok(page.closed);
    });

    test("backing up to both saves a file and a bookmark backup", async () => {
      const browser = createBrowser({ target, tabs: OPEN_TABS });
      await browser.storage.sync.set({ destination: "both" });
      page = await openPage("popup", { target, browser });
      await page.click("#backup");
      await page.settle();

      assert.equal(browser.downloads.saved.length, 1);
      assert.deepEqual(browser.bookmarks.titles(otherBookmarks(target)), [
        "Tab Backup",
      ]);
    });

    test("at the limit, it asks before deleting the oldest backup", async () => {
      const browser = createBrowser({ target, tabs: OPEN_TABS });
      await seedBookmarkBackups(browser, target, 1);
      await browser.storage.sync.set({
        destination: "bookmarks",
        keepBookmarkBackups: 1,
      });
      const [oldest] = await backupsIn(browser, target);

      page = await openPage("popup", { target, browser });
      await page.click("#backup");
      await page.settle();
      assert.equal(page.$("#limit-notice").hidden, false);
      assert.equal(
        page.text("#limit-title"),
        "You've reached your limit of 1 bookmark backup",
      );
      assert.equal(
        page.text("#limit-text"),
        "Backing up now deletes your oldest backup:",
      );
      assert.deepEqual(
        page.$$("#limit-list li").map((li) => li.textContent),
        [oldest.title],
      );

      await page.click("#limit-cancel");
      assert.equal(page.$("#limit-notice").hidden, true);
      assert.deepEqual(
        (await backupsIn(browser, target)).map((b) => b.id),
        [oldest.id],
      );

      await page.click("#backup");
      await page.settle();
      await page.click("#limit-confirm");
      await page.settle();
      const after = await backupsIn(browser, target);
      assert.equal(after.length, 1);
      assert.notEqual(after[0].id, oldest.id);
      assert.ok(page.closed);
    });

    test("without bookmark access, a bookmark backup falls back to a file", async () => {
      const browser = createBrowser({
        target,
        tabs: OPEN_TABS,
        bookmarksAllowed: false,
      });
      await browser.storage.sync.set({ destination: "bookmarks" });
      page = await openPage("popup", { target, browser });
      await page.click("#backup");
      await page.settle();
      assert.equal(browser.downloads.saved.length, 1);
    });

    test("Restore… opens the restore page; the gear opens settings", async () => {
      page = await openPage("popup", { target, tabs: OPEN_TABS });
      await page.click("#restore");
      assert.deepEqual(page.browser.tabs.created, [
        { url: page.browser.runtime.getURL("restore.html") },
      ]);
      await page.click("#settings");
      assert.equal(page.browser.runtime.optionsOpened, 1);
    });
  });

  describe(`restore page (${target})`, () => {
    test("a backup file is previewed, and Open restores the checked tabs", async () => {
      page = await openPage("restore", { target, tabs: OPEN_TABS.slice(0, 1) });
      await page.chooseFile(
        "backup.json",
        JSON.stringify([
          ...OPEN_TABS,
          { title: "Docs", url: "https://docs.example/" },
        ]),
      );

      assert.equal(page.$("#preview").hidden, false);
      assert.equal(page.text("#preview-title"), "backup.json");
      assert.equal(page.text("#preview-summary"), "3 tabs · 1 already open");
      assert.deepEqual(checkboxes(page), [false, true, true]);
      assert.match(page.$$("#preview-list li")[0].textContent, /Already open/);
      assert.equal(page.text("#preview-open"), "Open 2 tabs");

      await page.click("#preview-open");
      await page.settle();
      assert.deepEqual(page.browser.tabs.created, [
        { url: "https://github.com/", active: false },
        { url: "https://docs.example/", active: false },
      ]);
      assert.equal(page.text("#status"), "Opened 2 tabs.");
      assert.equal(page.$("#preview").hidden, true);
    });

    test("every sample backup format previews the same three tabs", async () => {
      page = await openPage("restore", { target });
      for (const ext of ["json", "md", "txt", "html"]) {
        await page.chooseFile(`three-tabs.${ext}`, sample(ext));
        assert.equal(page.text("#preview-summary"), "3 tabs", ext);
        assert.match(
          page.$$("#preview-list li")[2].textContent,
          /code\.claude\.com/,
          ext,
        );
        await page.click("#preview-cancel");
      }
    });

    test("tabs that are already open can be included, and selection updates the count", async () => {
      page = await openPage("restore", { target, tabs: OPEN_TABS });
      await page.chooseFile("backup.json", JSON.stringify(OPEN_TABS));
      assert.equal(page.text("#preview-open"), "Open 0 tabs");

      page.$("#skip-open").click();
      await page.flush();
      assert.equal(page.text("#preview-open"), "Open 2 tabs");

      await page.click("#select-none");
      assert.equal(page.text("#preview-open"), "Open 0 tabs");
      await page.click("#preview-open");
      assert.equal(page.text("#status"), "Select at least one tab to open.");
      assert.equal(page.browser.tabs.created.length, 0);

      await page.click("#select-all");
      assert.equal(page.text("#preview-open"), "Open 2 tabs");
    });

    test("pages extensions can't open are listed but not selectable", async () => {
      page = await openPage("restore", { target });
      await page.chooseFile(
        "backup.json",
        JSON.stringify([
          { title: "Prefs", url: "about:preferences" },
          {
            title: "Reader",
            url: "about:reader?url=https%3A%2F%2Fexample.com%2F",
          },
          { title: "New tab", url: "about:newtab" },
        ]),
      );
      assert.equal(page.text("#preview-summary"), "3 tabs · 1 can't be opened");
      assert.match(
        page.$$("#preview-list li")[0].textContent,
        /Can't be opened/,
      );

      await page.click("#preview-open");
      await page.settle();
      assert.deepEqual(page.browser.tabs.created, [
        target === "firefox"
          ? {
              url: "https://example.com/",
              openInReaderMode: true,
              active: false,
            }
          : { url: "https://example.com/", active: false },
        { active: false },
      ]);
      assert.equal(page.text("#status"), "Opened 2 tabs.");
    });

    test("a file that isn't a backup says so", async () => {
      page = await openPage("restore", { target });
      await page.chooseFile("notes.txt", "nothing to restore here");
      assert.equal(page.$("#preview").hidden, true);
      assert.equal(page.text("#status"), "No tabs found in this file.");
    });

    test("automatic backups are labeled in the list", async () => {
      const browser = createBrowser({ target });
      await seedBookmarkBackups(browser, target, 1, { automatic: true });
      page = await openPage("restore", { target, browser });
      const [row] = page.$$("#synced-list li");
      assert.equal(
        row.querySelectorAll("span span")[1].textContent,
        "Automatic",
      );
    });

    test("bookmark backups are listed, restored and deleted", async () => {
      const browser = createBrowser({ target });
      await seedBookmarkBackups(browser, target, 2);
      const [newest, oldest] = await backupsIn(browser, target);

      page = await openPage("restore", { target, browser });
      assert.equal(page.$("#synced").hidden, false);
      const rows = page.$$("#synced-list li");
      assert.deepEqual(
        rows.map((li) => li.querySelector("span").textContent),
        [newest.title, oldest.title],
      );

      await page.click(rows[0].querySelector("button"));
      await page.settle();
      assert.equal(page.text("#preview-title"), newest.title);
      assert.equal(page.text("#preview-summary"), "2 tabs");
      await page.click("#preview-cancel");

      const deleteOldest = () =>
        page.$$("#synced-list li")[1].querySelector('[aria-label^="Delete"]');
      const dialog = page.$("#delete-dialog");
      const answer = (value) =>
        page.click(dialog.querySelector(`button[value="${value}"]`));

      await page.click(deleteOldest());
      assert.ok(dialog.open, "the dialog asks first");
      assert.equal(
        page.text("#delete-title"),
        `Delete the backup "${oldest.title}"?`,
      );
      await answer("cancel");
      await page.settle();
      assert.equal(dialog.open, false);
      assert.equal((await backupsIn(browser, target)).length, 2);

      // Escape closes it without an answer.
      await page.click(deleteOldest());
      dialog.close();
      await page.settle();
      assert.equal((await backupsIn(browser, target)).length, 2);

      await page.click(deleteOldest());
      await answer("delete");
      await page.settle();
      assert.deepEqual(
        (await backupsIn(browser, target)).map((b) => b.id),
        [newest.id],
      );
      assert.equal(page.$$("#synced-list li").length, 1);
    });

    test("a bookmark backup can be renamed, which keeps it, and reset", async () => {
      const browser = createBrowser({ target });
      await seedBookmarkBackups(browser, target, 2);
      page = await openPage("restore", { target, browser });

      const row = () => page.$$("#synced-list li")[0];
      const lines = () =>
        [...row().querySelectorAll("span")]
          .filter((span) => !span.children.length)
          .map((span) => span.textContent);
      const rename = async (name, key = "Enter") => {
        await page.click(row().querySelector('[aria-label^="Rename"]'));
        const input = row().querySelector("input");
        assert.ok(page.document.activeElement === input, "the field has focus");
        await page.type("#synced-list input", name);
        input.dispatchEvent(new page.window.KeyboardEvent("keydown", { key }));
        await page.settle();
      };

      await rename("Trip research");
      const [renamed] = await backupsIn(browser, target);
      assert.equal(renamed.title, "Trip research");
      assert.equal(renamed.kept, true);
      assert.equal(renamed.entries.length, 2);
      // The date and size move under the new name.
      assert.equal(lines()[0], "Trip research");
      assert.match(lines()[1], /· 2 tabs$/);
      assert.ok(
        page.document.activeElement ===
          row().querySelector('[aria-label^="Rename"]'),
        "focus returns to Rename",
      );

      await rename("Something else", "Escape");
      assert.equal(
        (await backupsIn(browser, target))[0].title,
        "Trip research",
      );

      await rename("  ");
      const [reset] = await backupsIn(browser, target);
      assert.equal(reset.kept, false);
      assert.match(reset.title, /· 2 tabs$/);
      assert.deepEqual(lines(), [reset.title]);
      assert.equal((await backupsIn(browser, target))[1].kept, false);
    });

    test("Enter that confirms an input method's conversion doesn't save the name", async () => {
      const browser = createBrowser({ target });
      await seedBookmarkBackups(browser, target, 1);
      page = await openPage("restore", { target, browser });

      await page.click('#synced-list [aria-label^="Rename"]');
      await page.type("#synced-list input", "旅行");
      const input = page.$("#synced-list input");
      for (const key of ["Enter", "Escape"]) {
        input.dispatchEvent(
          new page.window.KeyboardEvent("keydown", { key, isComposing: true }),
        );
      }
      await page.settle();
      assert.ok(page.$("#synced-list input"), "still editing");

      input.dispatchEvent(
        new page.window.KeyboardEvent("keydown", { key: "Enter" }),
      );
      await page.settle();
      assert.equal((await backupsIn(browser, target))[0].title, "旅行");
    });

    test("bookmark backups appear once access is granted", async () => {
      const browser = createBrowser({ target, bookmarksAllowed: false });
      page = await openPage("restore", { target, browser });
      assert.equal(page.$("#synced").hidden, true);

      await browser.permissions.request({ permissions: ["bookmarks"] });
      await page.settle();
      assert.equal(page.$("#synced").hidden, false);
      assert.equal(page.$("#synced-empty").hidden, false);
    });
  });

  describe(`settings page (${target})`, () => {
    test("shows the saved settings and a file name preview", async () => {
      page = await openPage("settings", { target });
      assert.equal(checked(page, "destination"), "file");
      assert.equal(checked(page, "format"), "json");
      assert.equal(
        page.$("#filename").value,
        "tabs-{DD}-{MM}-{YYYY}_{HH}-{mm}",
      );
      assert.match(
        page.text("#filename-preview"),
        /^tabs-\d\d-\d\d-\d{4}_\d\d-\d\d\.json$/,
      );
      assert.equal(page.$("#keep").value, "20");
      assert.equal(page.$("#folder-name").value, "Tab Backup");
    });

    test("choosing a format saves it and updates the preview", async () => {
      page = await openPage("settings", { target });
      await page.choose("format", "markdown");
      await page.settle();
      assert.equal(page.browser.storage.sync.data.format, "markdown");
      assert.match(page.text("#filename-preview"), /\.md$/);
    });

    test("the file name pattern saves as you type, and Reset restores it", async () => {
      page = await openPage("settings", { target });
      await page.type("#filename", "backup-{count}");
      assert.equal(page.text("#filename-preview"), "backup-12.json");
      await page.settle();
      assert.equal(
        page.browser.storage.sync.data.filenamePattern,
        "backup-{count}",
      );

      await page.click("#filename-reset");
      await page.settle();
      assert.equal(
        page.$("#filename").value,
        "tabs-{DD}-{MM}-{YYYY}_{HH}-{mm}",
      );
      assert.equal(
        page.browser.storage.sync.data.filenamePattern,
        "tabs-{DD}-{MM}-{YYYY}_{HH}-{mm}",
      );
    });

    test("choosing bookmarks asks for access, then saves", async () => {
      const browser = createBrowser({ target, bookmarksAllowed: false });
      page = await openPage("settings", { target, browser });
      await page.choose("destination", "both");
      await page.settle();
      assert.equal(browser.permissions.requests, 1);
      assert.equal(browser.storage.sync.data.destination, "both");
    });

    test("refusing bookmark access keeps the file destination", async () => {
      const browser = createBrowser({ target, bookmarksAllowed: false });
      browser.permissions.answer = false;
      page = await openPage("settings", { target, browser });
      await page.choose("destination", "bookmarks");
      assert.equal(
        page.text("#status"),
        "Bookmark backups need access to your bookmarks.",
      );
      await page.settle();
      assert.equal(checked(page, "destination"), "file");
      assert.equal(browser.storage.sync.data.destination, undefined);
    });

    test("the number of bookmark backups to keep saves when valid", async () => {
      page = await openPage("settings", { target });
      await page.type("#keep", "5");
      await page.settle();
      assert.equal(page.browser.storage.sync.data.keepBookmarkBackups, 5);
      await page.type("#keep", "0");
      await page.settle();
      assert.equal(page.browser.storage.sync.data.keepBookmarkBackups, 5);
    });

    test("automatic backups start off, and their controls are disabled", async () => {
      page = await openPage("settings", { target });
      assert.equal(page.$("#auto-backup").checked, false);
      assert.equal(page.$("#auto-interval").value, "1440");
      assert.equal(page.$("#auto-interval").disabled, true);
      assert.equal(page.$("#keep-auto").value, "5");
      assert.equal(page.$("#keep-auto").disabled, true);
      assert.equal(page.text("#last-auto-backup"), "No automatic backup yet.");
    });

    test("turning on automatic backups asks for access, then saves on this device", async () => {
      const browser = createBrowser({ target, bookmarksAllowed: false });
      page = await openPage("settings", { target, browser });
      await toggle(page, "#auto-backup", true);
      await page.settle();
      assert.equal(browser.permissions.requests, 1);
      assert.equal(browser.storage.local.data.autoBackup, true);
      assert.equal(browser.storage.sync.data.autoBackup, undefined);
      assert.equal(page.$("#auto-interval").disabled, false);

      page.$("#auto-interval").value = "360";
      page.$("#auto-interval").dispatchEvent(new page.window.Event("change"));
      await page.type("#keep-auto", "3");
      await page.settle();
      assert.equal(browser.storage.sync.data.autoBackupInterval, 360);
      assert.equal(browser.storage.sync.data.keepAutoBackups, 3);

      await toggle(page, "#auto-backup", false);
      await page.settle();
      assert.equal(browser.storage.local.data.autoBackup, false);
      assert.equal(page.$("#keep-auto").disabled, true);
    });

    test("refusing bookmark access leaves automatic backups off", async () => {
      const browser = createBrowser({ target, bookmarksAllowed: false });
      browser.permissions.answer = false;
      page = await openPage("settings", { target, browser });
      await toggle(page, "#auto-backup", true);
      assert.equal(
        page.text("#status"),
        "Bookmark backups need access to your bookmarks.",
      );
      assert.equal(page.$("#auto-backup").checked, false);
      assert.equal(browser.storage.local.data.autoBackup, undefined);
    });

    test("shows when the last automatic backup was saved", async () => {
      const browser = createBrowser({ target });
      await browser.storage.local.set({
        autoBackup: true,
        lastAutoBackup: { time: Date.UTC(2026, 9, 30, 12), urls: [] },
      });
      page = await openPage("settings", { target, browser });
      assert.equal(page.$("#auto-backup").checked, true);
      assert.match(
        page.text("#last-auto-backup"),
        /^Last automatic backup: .*2026/,
      );
    });

    test("excluded sites save one per line; lines that aren't sites are pointed out", async () => {
      const browser = createBrowser({ target });
      await browser.storage.sync.set({ excludedSites: ["bank.example"] });
      page = await openPage("settings", { target, browser });
      const field = page.$("#excluded-sites");
      assert.equal(field.value, "bank.example");

      await page.type("#excluded-sites", "bank.example\nnot a site\n");
      assert.equal(page.text("#excluded-sites-error"), "", "not while typing");
      field.dispatchEvent(new page.window.Event("blur"));
      assert.equal(
        page.text("#excluded-sites-error"),
        "Ignored (not a site): not a site",
      );
      assert.equal(field.getAttribute("aria-invalid"), "true");

      await page.type(
        "#excluded-sites",
        "bank.example\nhttps://Mail.Example.com/",
      );
      assert.equal(page.text("#excluded-sites-error"), "");
      assert.equal(field.hasAttribute("aria-invalid"), false);
      await page.settle();
      assert.deepEqual(
        [...browser.storage.sync.data.excludedSites],
        ["bank.example", "mail.example.com"],
      );
    });

    test("the folder name can't be empty, and a new name renames the folder", async () => {
      const browser = createBrowser({ target });
      await seedBookmarkBackups(browser, target, 1);
      page = await openPage("settings", { target, browser });

      await page.type("#folder-name", "  ");
      assert.equal(page.text("#folder-name-error"), "Enter a folder name.");
      assert.equal(page.$("#folder-name").getAttribute("aria-invalid"), "true");

      await page.type("#folder-name", "Backups");
      assert.equal(page.text("#folder-name-error"), "");
      await page.settle();
      assert.equal(browser.storage.sync.data.bookmarkFolderName, "Backups");
      assert.deepEqual(browser.bookmarks.titles(otherBookmarks(target)), [
        "Backups",
      ]);
    });
  });
}

test("each build uses its own browser's wording", async () => {
  page = await openPage("settings", { target: "firefox" });
  assert.match(page.text("footer"), /signed in to Firefox/);
  await page.close();
  page = await openPage("settings", { target: "chrome" });
  assert.doesNotMatch(page.text("main"), /Firefox|Reader View/);
});

test("the pages follow the browser's language", async () => {
  page = await openPage("popup", {
    target: "firefox",
    locale: "fr",
    tabs: OPEN_TABS,
  });
  assert.equal(page.document.documentElement.lang, "fr");
  assert.equal(page.text("#backup"), "Sauvegarder");
  assert.equal(page.text("#restore"), "Restaurer…");
  assert.equal(page.$("#settings").getAttribute("aria-label"), "Paramètres");
  await page.close();

  page = await openPage("restore", {
    target: "chrome",
    locale: "ru",
    tabs: OPEN_TABS,
  });
  assert.equal(page.document.title, "Восстановление вкладок | Tab Backup");
  await page.chooseFile(
    "b.json",
    JSON.stringify([
      ...OPEN_TABS,
      ...["a", "b", "c"].map((x) => ({
        title: x,
        url: `https://${x}.example/`,
      })),
    ]),
  );
  assert.equal(page.text("#preview-summary"), "5 вкладок · 2 уже открыты");
  assert.equal(page.text("#preview-open"), "Открыть 3 вкладки");
});

function otherBookmarks(target) {
  return target === "firefox" ? "unfiled_____" : "2";
}

async function backupsIn(browser, target) {
  process.env.BROWSER = target;
  globalThis.browser = browser;
  const { listBookmarkBackups } = await import("../src/bookmark-backups.js");
  return listBookmarkBackups();
}

function checkboxes(page) {
  return page
    .$$("#preview-list input:not(.invisible)")
    .map((box) => box.checked);
}

// Ticks or clears a checkbox, as a user's click would.
async function toggle(page, selector, on) {
  const input = page.$(selector);
  input.checked = on;
  input.dispatchEvent(new page.window.Event("change", { bubbles: true }));
  await page.flush();
}

function checked(page, name) {
  return page.$(`input[name="${name}"]:checked`)?.value;
}
