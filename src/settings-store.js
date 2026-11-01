// Settings live in storage.sync, which Firefox syncs across the user's
// devices when they're signed in and add-on sync is on (100 KB quota).
export const DEFAULT_SETTINGS = {
  format: "json",
  filenamePattern: "tabs-{DD}-{MM}-{YYYY}_{HH}-{mm}",
  // "file", "bookmarks" or "both"
  destination: "file",
  keepBookmarkBackups: 20,
  bookmarkFolderName: "Tab Backup",
  // Minutes between automatic backups: 60, 360 or 1440.
  autoBackupInterval: 1440,
  keepAutoBackups: 5,
};

// Kept on this device only. Automatic backups are switched on per device,
// since each one grants bookmark access separately.
export const DEFAULT_LOCAL_SETTINGS = {
  autoBackup: false,
  // { time, urls } of the last automatic backup, or null.
  lastAutoBackup: null,
};

// Missing keys fall back to their defaults.
export function getSettings() {
  return browser.storage.sync.get(DEFAULT_SETTINGS);
}

export function saveSettings(changes) {
  return browser.storage.sync.set(changes);
}

export function getLocalSettings() {
  return browser.storage.local.get(DEFAULT_LOCAL_SETTINGS);
}

export function saveLocalSettings(changes) {
  return browser.storage.local.set(changes);
}
