import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { installBrowser } from "./fake-browser.js";

// The modules read `browser` (i18n reads its language) when they load.
installBrowser();
const { ALARM, runAutoBackup, scheduleAutoBackup } =
  await import("../src/auto-backup.js");
const { listBookmarkBackups } = await import("../src/bookmark-backups.js");

const MINUTE = 60_000;
const NOW = Date.UTC(2026, 9, 30, 12, 0);

let browser;
beforeEach(() => {
  browser = installBrowser({
    tabs: [
      { title: "Go", url: "https://go.dev/" },
      { title: "GitHub", url: "https://github.com/" },
      { title: "Secret", url: "https://private.example/", incognito: true },
      { title: "Popup", url: "https://popup.example/", windowType: "popup" },
    ],
  });
});

function turnOn() {
  return browser.storage.local.set({ autoBackup: true });
}

test("nothing is saved while automatic backups are off", async () => {
  assert.equal(await runAutoBackup(new Date(NOW)), false);
  assert.deepEqual(await listBookmarkBackups(), []);
});

test("nothing is saved without bookmark access", async () => {
  await turnOn();
  browser.permissions.granted.clear();
  assert.equal(await runAutoBackup(new Date(NOW)), false);
});

test("saves normal windows' tabs, leaving out private ones", async () => {
  await turnOn();
  assert.equal(await runAutoBackup(new Date(NOW)), true);

  const [backup] = await listBookmarkBackups();
  assert.equal(backup.automatic, true);
  assert.deepEqual(
    backup.entries.map((entry) => entry.url),
    ["https://go.dev/", "https://github.com/"],
  );
  const { lastAutoBackup } = browser.storage.local.data;
  assert.equal(lastAutoBackup.time, NOW);
  assert.deepEqual(lastAutoBackup.urls, [
    "https://go.dev/",
    "https://github.com/",
  ]);
});

test("unchanged tabs are skipped, and a change is saved", async () => {
  await turnOn();
  await runAutoBackup(new Date(NOW));
  assert.equal(await runAutoBackup(new Date(NOW + 60 * MINUTE)), false);

  browser.tabs.open.push({ id: 99, title: "MDN", url: "https://mdn.dev/" });
  assert.equal(await runAutoBackup(new Date(NOW + 120 * MINUTE)), true);
  assert.equal((await listBookmarkBackups()).length, 2);
});

test("the automatic limit prunes only automatic backups", async () => {
  await turnOn();
  await browser.storage.sync.set({ keepAutoBackups: 2 });
  for (let i = 0; i < 3; i++) {
    browser.tabs.open.push({ id: 100 + i, url: `https://example.com/${i}` });
    await runAutoBackup(new Date(NOW + i * MINUTE));
  }
  assert.equal((await listBookmarkBackups()).length, 2);
});

test("the alarm follows the switch and the interval", async () => {
  await scheduleAutoBackup(NOW);
  assert.equal(browser.alarms.created.has(ALARM), false);

  // No backup yet: the first comes a minute later.
  await turnOn();
  await scheduleAutoBackup(NOW);
  assert.deepEqual(browser.alarms.created.get(ALARM), {
    when: NOW + MINUTE,
    periodInMinutes: 1440,
  });

  // Otherwise one interval after the last backup.
  await browser.storage.local.set({
    lastAutoBackup: { time: NOW - 30 * MINUTE, urls: [] },
  });
  await browser.storage.sync.set({ autoBackupInterval: 60 });
  await scheduleAutoBackup(NOW);
  assert.deepEqual(browser.alarms.created.get(ALARM), {
    when: NOW + 30 * MINUTE,
    periodInMinutes: 60,
  });

  await browser.storage.local.set({ autoBackup: false });
  await scheduleAutoBackup(NOW);
  assert.equal(browser.alarms.created.has(ALARM), false);
});

test("a backup missed while the browser was closed comes a minute after start", async () => {
  await turnOn();
  await browser.storage.local.set({
    lastAutoBackup: { time: NOW - 3 * 1440 * MINUTE, urls: [] },
  });
  await scheduleAutoBackup(NOW);
  assert.equal(browser.alarms.created.get(ALARM).when, NOW + MINUTE);
});
