import { test } from "node:test";
import assert from "node:assert/strict";
import { installBrowser } from "./fake-browser.js";

// i18n.js reads the language when it loads, so each browser/locale gets its
// own copy of the module (the query string makes it a separate import).
async function load(locale, target = "firefox") {
  installBrowser({ target, locale });
  return import(`../src/i18n.js?${target}-${locale}`);
}

test("plural forms follow each language's rules", async () => {
  const expected = {
    en: { 0: "0 tabs", 1: "1 tab", 2: "2 tabs", 21: "21 tabs" },
    fr: { 0: "0 onglet", 1: "1 onglet", 2: "2 onglets", 21: "21 onglets" },
    de: { 0: "0 Tabs", 1: "1 Tab", 2: "2 Tabs", 21: "21 Tabs" },
    ru: {
      0: "0 вкладок",
      1: "1 вкладка",
      2: "2 вкладки",
      5: "5 вкладок",
      21: "21 вкладка",
      22: "22 вкладки",
    },
    ja: { 0: "0 個のタブ", 1: "1 個のタブ", 21: "21 個のタブ" },
    tr: { 1: "1 sekme", 2: "2 sekme" },
  };
  for (const [locale, counts] of Object.entries(expected)) {
    const { language, plural } = await load(locale);
    assert.equal(language, locale);
    for (const [count, text] of Object.entries(counts)) {
      assert.equal(
        plural("tabCount", Number(count)),
        text,
        `${locale} ${count}`,
      );
    }
  }
});

test("plural passes extra substitutions after the count", async () => {
  const { plural } = await load("en");
  assert.equal(
    plural("backupFolderTitle", 3, "Oct 27, 2026"),
    "Oct 27, 2026 · 3 tabs",
  );
  const ru = await load("ru");
  assert.equal(ru.plural("openTabs", 21), "Открыть 21 вкладку");
  assert.equal(
    ru.plural("limitText", 1),
    "Если сохранить сейчас, будет удалена 1 самая старая копия:",
  );
});

test("t fills substitutions and returns the key when a message is missing", async () => {
  const { t } = await load("fr");
  assert.equal(
    t("backupFolderTaken", "Tab Backup"),
    "Tab Backup (sauvegardes)",
  );
  const warn = console.warn;
  console.warn = () => {};
  try {
    assert.equal(t("noSuchMessage"), "noSuchMessage");
  } finally {
    console.warn = warn;
  }
});

test("joined sentences use the language's spacing", async () => {
  const en = await load("en");
  assert.equal(
    en.t("twoSentences", "Opened 4 tabs.", "Skipped 1."),
    "Opened 4 tabs. Skipped 1.",
  );
  const ja = await load("ja");
  assert.equal(ja.t("twoSentences", "A。", "B。"), "A。B。");
});

test("each browser gets its own wording", async () => {
  const firefox = await load("fr", "firefox");
  assert.equal(firefox.t("destinationBookmarks"), "Marque-pages");
  assert.match(firefox.t("settingsSyncNote"), /Firefox/);
  const chrome = await load("fr", "chrome");
  assert.equal(chrome.t("destinationBookmarks"), "Favoris");
  assert.doesNotMatch(chrome.t("settingsSyncNote"), /Firefox/);
});

test("a browser language without a translation falls back to English", async () => {
  const { language, plural } = await load("es");
  assert.equal(language, "en");
  assert.equal(plural("openTabs", 1), "Open 1 tab");
});
