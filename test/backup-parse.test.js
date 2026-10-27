import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { FORMATS } from "../src/formats.js";
import {
  NEW_TAB_URLS,
  displayUrl,
  parseBackup,
  toCreateProperties,
} from "../src/backup-parse.js";
import { AWKWARD_TABS as TABS } from "./fixtures.js";

const sample = (ext) =>
  fs.readFileSync(
    new URL(`../samples/three-tabs.${ext}`, import.meta.url),
    "utf8",
  );

test("the sample backups each restore the same three tabs", () => {
  const tabs = JSON.parse(sample("json"));
  assert.equal(tabs.length, 3);
  for (const ext of ["json", "md", "txt"]) {
    assert.deepEqual(
      parseBackup(sample(ext)).map((tab) => tab.url),
      tabs.map((tab) => tab.url),
      ext,
    );
  }
  assert.equal(parseBackup(sample("md"))[0].title, tabs[0].title);
});

test("JSON backups round-trip every tab, including about: pages", () => {
  assert.deepEqual(parseBackup(FORMATS.json.serialize(TABS)), TABS);
});

test("JSON keeps duplicates and drops entries without a URL", () => {
  const text = JSON.stringify([
    { title: "A", url: "https://a.example/" },
    { title: "A again", url: "https://a.example/" },
    { title: "no url" },
    { title: 5, url: "https://b.example/" },
    null,
    "https://not-an-entry.example/",
  ]);
  assert.deepEqual(parseBackup(text), [
    { title: "A", url: "https://a.example/" },
    { title: "A again", url: "https://a.example/" },
    { title: "", url: "https://b.example/" },
  ]);
});

test("JSON that isn't a list has no tabs", () => {
  assert.deepEqual(parseBackup('{"url": "https://a.example/"}'), []);
  assert.deepEqual(parseBackup("42"), []);
});

test("Markdown backups round-trip web links, with titles unescaped", () => {
  assert.deepEqual(
    parseBackup(FORMATS.markdown.serialize(TABS)),
    TABS.slice(0, 2),
  );
});

test("Markdown links without <…> and bare URLs are read too", () => {
  const text = [
    "# Reading list",
    "- [Plain](https://plain.example/page)",
    "See https://bare.example/x?y=1, and [again](https://plain.example/page).",
  ].join("\n");
  assert.deepEqual(parseBackup(text), [
    { title: "Plain", url: "https://plain.example/page" },
    { title: "", url: "https://bare.example/x?y=1" },
  ]);
});

test("bare URLs drop sentence punctuation but keep their own brackets", () => {
  const text =
    "Read https://a.example/page. Then (https://b.example/q?x=1) and " +
    "https://en.wikipedia.org/wiki/Tab_(interface)! Done: https://c.example/;";
  assert.deepEqual(
    parseBackup(text).map((tab) => tab.url),
    [
      "https://a.example/page",
      "https://b.example/q?x=1",
      "https://en.wikipedia.org/wiki/Tab_(interface)",
      "https://c.example/",
    ],
  );
});

test("plain-text backups round-trip web links, once each", () => {
  const text = FORMATS.text.serialize([...TABS, TABS[0]]);
  assert.deepEqual(parseBackup(text), [
    { title: "", url: "https://go.dev/" },
    { title: "", url: "https://example.com/a_(b)?x=1&y=2" },
  ]);
});

test("a file with no links has no tabs", () => {
  assert.deepEqual(parseBackup("nothing to see here"), []);
  assert.deepEqual(parseBackup(""), []);
});

test("new tab pages open the browser's own new tab", () => {
  assert.ok(NEW_TAB_URLS.has("about:newtab"));
  assert.ok(NEW_TAB_URLS.has("chrome://newtab/"));
  for (const url of NEW_TAB_URLS) {
    assert.deepEqual(toCreateProperties(url), {}, url);
  }
});

test("Reader View pages reopen in Reader View in Firefox only", () => {
  const url = "about:reader?url=https%3A%2F%2Fexample.com%2Fpost";
  process.env.BROWSER = "firefox";
  assert.deepEqual(toCreateProperties(url), {
    url: "https://example.com/post",
    openInReaderMode: true,
  });
  process.env.BROWSER = "chrome";
  assert.deepEqual(toCreateProperties(url), {
    url: "https://example.com/post",
  });
  assert.equal(toCreateProperties("about:reader?nothing=here"), null);
});

test("pages extensions can't open are refused; others pass through", () => {
  for (const url of [
    "about:preferences",
    "about:config",
    "chrome://settings/",
    "file:///etc/hosts",
    "data:text/html,hi",
    "javascript:alert(1)",
    "view-source:https://a.example/",
    "resource://gre/",
  ]) {
    assert.equal(toCreateProperties(url), null, url);
  }
  assert.deepEqual(toCreateProperties("about:blank"), { url: "about:blank" });
  assert.deepEqual(toCreateProperties("https://a.example/"), {
    url: "https://a.example/",
  });
});

test("URLs are shown without the scheme or a lone slash", () => {
  assert.equal(displayUrl("https://go.dev/"), "go.dev");
  assert.equal(
    displayUrl("https://code.claude.com/docs/en/overview"),
    "code.claude.com/docs/en/overview",
  );
  assert.equal(displayUrl("about:newtab"), "about:newtab");
  assert.equal(displayUrl("not a url"), "not a url");
});
