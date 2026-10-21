// Settings live in storage.sync, which Firefox syncs across the user's
// devices when they're signed in and add-on sync is on (100 KB quota).
export const DEFAULT_SETTINGS = {
  format: "json",
  filenamePattern: "tabs-{DD}-{MM}-{YYYY}_{HH}-{mm}",
  // "file", "bookmarks" or "both"
  destination: "file",
  keepBookmarkBackups: 20,
};

// Missing keys fall back to their defaults.
export function getSettings() {
  return browser.storage.sync.get(DEFAULT_SETTINGS);
}

export function saveSettings(changes) {
  return browser.storage.sync.set(changes);
}
