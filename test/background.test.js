import { test, beforeEach, afterEach, mock } from "node:test";
import assert from "node:assert/strict";
import { installBrowser } from "./fake-browser.js";

let browser;
let loads = 0;

// A fresh background script per test, listening on a fresh fake.
beforeEach(async () => {
  mock.timers.enable({ apis: ["setTimeout"] });
  browser = installBrowser({
    tabs: [
      { title: "Go", url: "https://go.dev/" },
      { title: "GitHub", url: "https://github.com/" },
    ],
  });
  await import(`../src/background.js?${loads++}`);
});
afterEach(() => mock.timers.reset());

// Lets the pending update finish once its delay has passed.
async function settle() {
  mock.timers.tick(100);
  for (let i = 0; i < 5; i++) {
    await new Promise((resolve) => setImmediate(resolve));
  }
}

function openTab(n) {
  const tab = {
    id: 1000 + n,
    title: `Tab ${n}`,
    url: `https://example.com/${n}`,
  };
  browser.tabs.open.push(tab);
  browser.tabs.onCreated.fire(tab);
  return tab;
}

test("install and browser start set the badge color and count", async () => {
  browser.runtime.onInstalled.fire({ reason: "install" });
  await settle();
  assert.equal(browser.action.badgeText, "2");
  assert.equal(browser.action.badgeColor, "#008000");

  browser.action.badgeColor = null;
  browser.runtime.onStartup.fire();
  await settle();
  assert.equal(browser.action.badgeColor, "#008000");
});

test("a burst of new tabs updates the badge once", async () => {
  for (let n = 0; n < 300; n++) openTab(n);
  await settle();
  assert.equal(browser.action.badgeText, "302");
  assert.equal(browser.tabs.queries, 1);
  assert.equal(browser.action.textUpdates, 1);
});

test("a closed tab Firefox still lists isn't counted", async () => {
  const tab = openTab(1);
  await settle();
  assert.equal(browser.action.badgeText, "3");

  // Firefox bug 1396758: onRemoved fires while the tab is still listed.
  browser.tabs.onRemoved.fire(tab.id);
  await settle();
  assert.equal(browser.action.badgeText, "2");
});

test("a closed tab that's already gone is counted once", async () => {
  const tab = openTab(1);
  await settle();
  browser.tabs.open.splice(browser.tabs.open.indexOf(tab), 1);
  browser.tabs.onRemoved.fire(tab.id);
  await settle();
  assert.equal(browser.action.badgeText, "2");
});
