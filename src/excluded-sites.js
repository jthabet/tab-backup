// Sites the user never wants backed up, written one per line in settings.
// Each covers its subdomains: "google.com" also leaves out mail.google.com.

// Reads the settings field into hostnames, plus the lines that aren't one.
// Pasted addresses ("https://bank.com/login") and "*.bank.com" also work.
export function parseSites(text) {
  const sites = [];
  const invalid = [];
  for (const line of text.split("\n")) {
    const entry = line.trim();
    if (!entry) continue;
    const site = toHostname(entry);
    if (!site) invalid.push(entry);
    else if (!sites.includes(site)) sites.push(site);
  }
  return { sites, invalid };
}

function toHostname(entry) {
  const name = entry.replace(/^\*\./, "");
  const hasScheme = /^[a-z][a-z\d+.-]*:\/\//i.test(name);
  try {
    // URL lowercases the name and turns non-ASCII names into the
    // punycode that tab URLs use.
    const url = new URL(hasScheme ? name : `http://${name}`);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.hostname.replace(/\.$/, "") || null;
  } catch {
    return null;
  }
}

export function isExcluded(url, sites) {
  if (sites.length === 0) return false;
  // A Reader View tab belongs to the page it shows.
  if (url.startsWith("about:reader?")) {
    url = new URLSearchParams(url.slice("about:reader?".length)).get("url");
  }
  let host;
  try {
    host = new URL(url).hostname;
  } catch {
    return false;
  }
  return sites.some((site) => host === site || host.endsWith(`.${site}`));
}

export function withoutExcluded(tabs, sites) {
  return tabs.filter((tab) => !isExcluded(tab.url, sites));
}
