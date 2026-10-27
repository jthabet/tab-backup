// Reading backups and deciding how to reopen their tabs. No DOM or
// extension APIs here except DOMParser for HTML bookmark files, so this can
// be tested outside the browser.

// Returns the tabs in a backup as [{ title, url }]. JSON backups keep every
// entry, including about: pages and duplicates. Markdown, plain-text and
// HTML-bookmark backups carry only their http(s) links, read once each,
// with the link text as the title where there is one.
export function parseBackup(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return dedupe(
      /<a\s[^>]*href=/i.test(text)
        ? parseHtmlLinks(text)
        : parseTextLinks(text),
    );
  }
  if (!Array.isArray(data)) return [];
  return data
    .filter((entry) => entry && typeof entry.url === "string" && entry.url)
    .map((entry) => ({
      title: typeof entry.title === "string" ? entry.title : "",
      url: entry.url,
    }));
}

// Bookmark files escape & as &amp; in hrefs, so read them as HTML.
function parseHtmlLinks(text) {
  return [...new DOMParser().parseFromString(text, "text/html").links]
    .map((link) => ({
      title: link.textContent.trim(),
      url: link.getAttribute("href"),
    }))
    .filter(({ url }) => /^https?:\/\//i.test(url));
}

// Markdown links ([title](<url>) or [title](url)) first, then bare URLs in
// the rest of the text (plain-text backups have one URL per line).
function parseTextLinks(text) {
  const entries = [];
  const markdownLink = /\[((?:\\.|[^\]\\])*)\]\((?:<([^>]+)>|([^\s)]+))\)/g;
  for (const [, title, angled, plain] of text.matchAll(markdownLink)) {
    const url = angled ?? plain;
    if (/^https?:\/\//i.test(url)) {
      entries.push({ title: title.replace(/\\(.)/g, "$1"), url });
    }
  }
  const rest = text.replace(markdownLink, " ");
  for (const url of rest.match(/https?:\/\/[^\s"'<>]+/g) ?? []) {
    entries.push({ title: "", url: trimTrailingPunctuation(url) });
  }
  return entries;
}

// "See https://a.example/page." means the page, not "page.": drop trailing
// punctuation, and a closing bracket that has no opening one in the URL.
const OPENING = { ")": "(", "]": "[" };

function trimTrailingPunctuation(url) {
  for (;;) {
    const last = url.at(-1);
    const unmatched =
      OPENING[last] && count(url, OPENING[last]) < count(url, last);
    if (!/[.,;:!?]/.test(last) && !unmatched) return url;
    url = url.slice(0, -1);
  }
}

function count(text, char) {
  return text.split(char).length - 1;
}

function dedupe(entries) {
  const seen = new Map();
  for (const entry of entries) {
    if (!seen.has(entry.url)) seen.set(entry.url, entry);
  }
  return [...seen.values()];
}

export function displayUrl(url) {
  try {
    const { host, pathname } = new URL(url);
    return host ? host + (pathname === "/" ? "" : pathname) : url;
  } catch {
    return url;
  }
}

export const NEW_TAB_URLS = new Set([
  "about:newtab",
  "about:home",
  "about:privatebrowsing",
  "chrome://newtab/",
]);

// Schemes tabs.create rejects as "Illegal URL" (about:blank is the one
// allowed about: page).
const PRIVILEGED_SCHEMES =
  /^(about|chrome|resource|file|data|javascript|view-source):/i;

// Maps a saved URL to tabs.create properties, or null if it cannot be opened.
export function toCreateProperties(url) {
  if (NEW_TAB_URLS.has(url)) return {}; // no url opens the default new tab page
  if (url.startsWith("about:reader?")) {
    const original = new URLSearchParams(url.slice("about:reader?".length)).get(
      "url",
    );
    if (!original) return null;
    // Chromium has no Reader View and rejects unknown properties.
    return process.env.BROWSER === "firefox"
      ? { url: original, openInReaderMode: true }
      : { url: original };
  }
  if (url === "about:blank") return { url };
  if (PRIVILEGED_SCHEMES.test(url)) return null;
  return { url };
}
