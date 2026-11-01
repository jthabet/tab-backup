// Automatic backups: when switched on (per device, in settings), the
// background script saves every normal window's tabs to bookmarks on an
// alarm. They're pruned against their own limit, apart from the ones made
// with Back up, and never saved to a file, since nobody is there to see it.
import {
  getLocalSettings,
  getSettings,
  saveLocalSettings,
} from "./settings-store.js";
import {
  hasBookmarksPermission,
  saveBookmarkBackup,
} from "./bookmark-backups.js";
import { withoutExcluded } from "./excluded-sites.js";

export const ALARM = "auto-backup";
const MINUTE = 60_000; // ms

// Sets the alarm to match the settings. Firefox drops alarms when it quits,
// so this also runs at startup; a backup missed while the browser was
// closed is made a minute after it starts.
export async function scheduleAutoBackup(now = Date.now()) {
  const [{ autoBackup, lastAutoBackup }, { autoBackupInterval }] =
    await Promise.all([getLocalSettings(), getSettings()]);
  if (!autoBackup) {
    await browser.alarms.clear(ALARM);
    return;
  }
  const due = (lastAutoBackup?.time ?? 0) + autoBackupInterval * MINUTE;
  await browser.alarms.create(ALARM, {
    when: Math.max(due, now + MINUTE),
    periodInMinutes: autoBackupInterval,
  });
}

// Saves every tab outside private windows and excluded sites, unless they're the same as at
// the last automatic backup. Returns whether a backup was saved.
export async function runAutoBackup(now = new Date()) {
  const [local, settings] = await Promise.all([
    getLocalSettings(),
    getSettings(),
  ]);
  // Bookmark access can be revoked in about:addons.
  if (!local.autoBackup || !(await hasBookmarksPermission())) return false;

  const tabs = withoutExcluded(
    (await browser.tabs.query({ windowType: "normal" })).filter(
      (tab) => !tab.incognito,
    ),
    settings.excludedSites,
  );
  const urls = tabs.map((tab) => tab.url);
  if (urls.length === 0 || sameUrls(urls, local.lastAutoBackup?.urls)) {
    return false;
  }

  await saveBookmarkBackup(tabs, now, {
    keep: settings.keepAutoBackups,
    folderName: settings.bookmarkFolderName,
    automatic: true,
  });
  await saveLocalSettings({ lastAutoBackup: { time: now.getTime(), urls } });
  return true;
}

function sameUrls(a, b = []) {
  return a.length === b.length && a.every((url, i) => url === b[i]);
}
