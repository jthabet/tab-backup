import { test } from "node:test";
import assert from "node:assert/strict";
import { FORMATS, formatFilename } from "../src/formats.js";
import { AWKWARD_TABS as TABS } from "./fixtures.js";

test("JSON keeps only title and url, for every tab", () => {
  const tabs = TABS.map((tab, id) => ({ id, active: false, ...tab }));
  assert.deepEqual(JSON.parse(FORMATS.json.serialize(tabs)), TABS);
});

test("an untitled tab is listed by its URL", () => {
  const untitled = [{ title: "", url: "https://a.example/" }];
  assert.equal(
    FORMATS.markdown.serialize(untitled),
    "- [https://a.example/](<https://a.example/>)\n",
  );
  assert.match(
    FORMATS.html.serialize(untitled, { folder: "x" }),
    /<A HREF="https:\/\/a\.example\/">https:\/\/a\.example\/<\/A>/,
  );
});

test("Markdown escapes titles and wraps URLs in <…>", () => {
  assert.equal(
    FORMATS.markdown.serialize(TABS),
    [
      "- [Go](<https://go.dev/>)",
      "- [A \\[b\\] \\<c> & d](<https://example.com/a_(b)?x=1&y=2>)",
      "- [New Tab](<about:newtab>)",
      "",
    ].join("\n"),
  );
});

test("plain text is one URL per line", () => {
  assert.equal(
    FORMATS.text.serialize(TABS),
    "https://go.dev/\nhttps://example.com/a_(b)?x=1&y=2\nabout:newtab\n",
  );
});

test("HTML bookmarks escape URLs, titles and the folder name", () => {
  const html = FORMATS.html.serialize(TABS, { folder: "Tab Backup <1>" });
  assert.match(html, /^<!DOCTYPE NETSCAPE-Bookmark-file-1>/);
  assert.match(html, /<H3>Tab Backup &lt;1&gt;<\/H3>/);
  assert.match(
    html,
    /<A HREF="https:\/\/example\.com\/a_\(b\)\?x=1&amp;y=2">A \[b\] &lt;c&gt; &amp; d<\/A>/,
  );
  assert.match(html, /<A HREF="about:newtab">New Tab<\/A>/);
});

test("each format has its file extension and type", () => {
  assert.deepEqual(
    Object.fromEntries(
      Object.entries(FORMATS).map(([name, f]) => [name, [f.extension, f.type]]),
    ),
    {
      json: ["json", "application/json"],
      markdown: ["md", "text/markdown"],
      text: ["txt", "text/plain"],
      html: ["html", "text/html"],
    },
  );
});

test("file names fill every token with zero-padded values", () => {
  const date = new Date(2026, 2, 4, 5, 6, 7); // local time
  assert.equal(
    formatFilename("{YYYY}-{MM}-{DD}_{HH}-{mm}-{ss}_{count}", date, 3),
    "2026-03-04_05-06-07_3",
  );
  assert.equal(
    formatFilename("tabs-{DD}-{MM}-{YYYY}_{HH}-{mm}", date, 3),
    "tabs-04-03-2026_05-06",
  );
});

test("file names replace characters downloads would reject", () => {
  const date = new Date(2026, 0, 1);
  assert.equal(
    formatFilename('a/b\\c:d*e?f"g<h>i|j', date, 1),
    "a-b-c-d-e-f-g-h-i-j",
  );
  assert.equal(formatFilename("  .name.  ", date, 1), "name");
  assert.equal(formatFilename("{unknown}", date, 1), "{unknown}");
});

test('an empty file name falls back to "tabs"', () => {
  const date = new Date(2026, 0, 1);
  assert.equal(formatFilename("", date, 1), "tabs");
  assert.equal(formatFilename(" ... ", date, 1), "tabs");
});
