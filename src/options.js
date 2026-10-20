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
  let objects;
  try {
    objects = JSON.parse(text);
  } catch (err) {
    console.error(`Invalid backup file: ${err}`);
    return;
  }
  if (!Array.isArray(objects)) {
    console.error("Invalid backup file: expected an array of {title, url}");
    return;
  }

  const entries = objects.filter(
    (object) => object && typeof object.url === "string" && object.url,
  );
  console.log(`found ${entries.length} tabs`);

  for (const { url } of entries) {
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
