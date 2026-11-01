import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isExcluded,
  parseSites,
  withoutExcluded,
} from "../src/excluded-sites.js";

test("sites are read one per line, from names or pasted addresses", () => {
  assert.deepEqual(
    parseSites(
      [
        "bank.com",
        "  Mail.Google.com  ",
        "",
        "https://www.example.org/login?x=1",
        "*.intranet.example",
        "bank.com",
        "localhost:8080",
        "bücher.de",
      ].join("\n"),
    ),
    {
      sites: [
        "bank.com",
        "mail.google.com",
        "www.example.org",
        "intranet.example",
        "localhost",
        "xn--bcher-kva.de",
      ],
      invalid: [],
    },
  );
});

test("lines that aren't a site are reported", () => {
  assert.deepEqual(parseSites("bank.com\nnot a site\nftp://files.example"), {
    sites: ["bank.com"],
    invalid: ["not a site", "ftp://files.example"],
  });
});

test("a site covers its subdomains, and nothing else", () => {
  const sites = ["google.com"];
  assert.equal(isExcluded("https://google.com/", sites), true);
  assert.equal(isExcluded("https://mail.google.com/u/0", sites), true);
  assert.equal(isExcluded("http://google.com:8080/", sites), true);
  assert.equal(isExcluded("https://notgoogle.com/", sites), false);
  assert.equal(isExcluded("https://google.com.evil.example/", sites), false);
  assert.equal(isExcluded("https://example.com/?q=google.com", sites), false);
});

test("Reader View tabs count as the page they show", () => {
  const reader = `about:reader?url=${encodeURIComponent("https://bank.com/a")}`;
  assert.equal(isExcluded(reader, ["bank.com"]), true);
  assert.equal(isExcluded(reader, ["other.com"]), false);
});

test("pages without a host are never excluded", () => {
  for (const url of ["about:newtab", "about:reader?x=1", "file:///tmp/a"]) {
    assert.equal(isExcluded(url, ["bank.com"]), false);
  }
});

test("withoutExcluded keeps the other tabs in order", () => {
  const tabs = [
    { url: "https://a.example/" },
    { url: "https://bank.com/" },
    { url: "https://b.example/" },
  ];
  assert.deepEqual(withoutExcluded(tabs, ["bank.com"]), [tabs[0], tabs[2]]);
  assert.equal(withoutExcluded(tabs, []).length, 3);
});
