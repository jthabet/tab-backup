import "./main.css";

document.getElementById("input").addEventListener("change", (event) => {
  const input = event.target;
  const file = input.files[0];
  if (!file) return;
  file
    .text()
    .then(openImportedTabs)
    .catch((err) => console.error(err))
    // Allow choosing the same file again to re-trigger the change event.
    .finally(() => {
      input.value = "";
    });
});

function openImportedTabs(text) {
  const urls = parseBackup(text);
  if (urls.length === 0) {
    console.error("No tabs found in this backup file");
    return;
  }
  console.log(`found ${urls.length} tabs`);

  for (const url of urls) {
    const properties = toCreateProperties(url);
    if (!properties) {
      console.warn(`Skipped ${url}: extensions cannot open this kind of URL`);
      continue;
    }
    browser.tabs
      .create({ ...properties, active: false })
      .then((tab) => console.info(`Created new tab: ${tab.title}`))
      .catch((error) => console.error(`Error opening ${url}: ${error}`));
  }
}

// Returns the URLs in a backup. JSON backups ([{title, url}]) keep every
// entry, including about: pages and duplicates; Markdown, plain-text and
// HTML-bookmark backups only carry their http(s) links, read once each.
function parseBackup(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    // Bookmark files escape & as &amp; in hrefs, so read them as HTML.
    const links = /<a\s[^>]*href=/i.test(text)
      ? [...new DOMParser().parseFromString(text, "text/html").links]
          .map((link) => link.getAttribute("href"))
          .filter((href) => /^https?:\/\//i.test(href))
      : (text.match(/https?:\/\/[^\s"'<>]+/g) ?? []);
    return [...new Set(links)];
  }
  if (!Array.isArray(data)) return [];
  return data
    .filter((entry) => entry && typeof entry.url === "string" && entry.url)
    .map((entry) => entry.url);
}

const NEW_TAB_URLS = new Set([
  "about:newtab",
  "about:home",
  "about:privatebrowsing",
]);

// Schemes tabs.create rejects as "Illegal URL" (about:blank is the one
// allowed about: page).
const PRIVILEGED_SCHEMES =
  /^(about|chrome|resource|file|data|javascript|view-source):/i;

// Maps a saved URL to tabs.create properties, or null if it cannot be opened.
function toCreateProperties(url) {
  if (NEW_TAB_URLS.has(url)) return {}; // no url opens the default new tab page
  if (url.startsWith("about:reader?")) {
    const original = new URLSearchParams(url.slice("about:reader?".length)).get(
      "url",
    );
    return original ? { url: original, openInReaderMode: true } : null;
  }
  if (url === "about:blank") return { url };
  if (PRIVILEGED_SCHEMES.test(url)) return null;
  return { url };
}
