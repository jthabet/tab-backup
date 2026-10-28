// Opens one of the built extension pages (dist/ for Firefox, dist-chrome/ for
// Chromium) in happy-dom, with the fake browser API, so tests can click
// through the real popup, restore and settings pages. Run `pnpm build` and
// `pnpm build:chrome` first; `pnpm test` does.
import fs from "node:fs";
import { Window } from "happy-dom";
import { createBrowser } from "./fake-browser.js";

const ROOT = new URL("..", import.meta.url);
const BUILD = { firefox: "dist", chrome: "dist-chrome" };

export async function openPage(name, options = {}) {
  const target = options.target ?? "firefox";
  const browser = options.browser ?? createBrowser(options);
  const dir = new URL(`${BUILD[target]}/`, ROOT);
  const read = (file) => fs.readFileSync(new URL(file, dir), "utf8");

  const window = new Window({
    url: browser.runtime.getURL(`${name}.html`),
    // Timers run at most 20 ms, so debounced saves don't slow tests down.
    settings: {
      disableJavaScriptFileLoading: true,
      disableCSSFileLoading: true,
      timer: { maxTimeout: 20 },
    },
  });
  const { document } = window;

  // Keep each download's blob, since the page revokes its URL afterwards.
  const blobs = new Map();
  const createObjectURL = window.URL.createObjectURL.bind(window.URL);
  window.URL.createObjectURL = (blob) => {
    const url = createObjectURL(blob);
    blobs.set(url, blob);
    return url;
  };

  const page = {
    window,
    document,
    browser,
    closed: false,
    confirms: [],
    confirmAnswer: true,

    $: (selector) => document.querySelector(selector),
    $$: (selector) => [...document.querySelectorAll(selector)],
    // An element's visible text, with whitespace collapsed.
    text: (selector) =>
      document.querySelector(selector).textContent.replace(/\s+/g, " ").trim(),

    // Lets pending promises run, but not timers (so short-lived status
    // messages can still be read).
    async flush() {
      for (let i = 0; i < 10; i++) {
        await new Promise((resolve) => setImmediate(resolve));
      }
    },
    // Lets everything finish, timers included.
    async settle() {
      for (let i = 0; i < 3; i++) {
        await page.flush();
        await window.happyDOM.waitUntilComplete();
      }
    },

    async click(selector) {
      const element =
        typeof selector === "string"
          ? document.querySelector(selector)
          : selector;
      element.click();
      await page.flush();
    },
    // Picks a radio button, as a user's click would.
    async choose(name, value) {
      const input = document.querySelector(
        `input[name="${name}"][value="${value}"]`,
      );
      input.checked = true;
      input.dispatchEvent(new window.Event("change", { bubbles: true }));
      await page.flush();
    },
    async type(selector, value) {
      const input = document.querySelector(selector);
      input.value = value;
      input.dispatchEvent(new window.Event("input", { bubbles: true }));
      await page.flush();
    },
    // Picks a file in the restore page's file chooser.
    async chooseFile(fileName, contents) {
      const input = document.querySelector('input[type="file"]');
      const file = new window.File([contents], fileName);
      Object.defineProperty(input, "files", {
        value: [file],
        configurable: true,
      });
      input.dispatchEvent(new window.Event("change", { bubbles: true }));
      await page.settle();
    },

    // The downloaded files, with their contents.
    async downloads() {
      return Promise.all(
        browser.downloads.saved.map(async ({ filename, url }) => ({
          filename,
          contents: await blobs.get(url).text(),
        })),
      );
    },

    async close() {
      await window.happyDOM.close();
    },
  };

  window.close = () => {
    page.closed = true;
  };
  window.confirm = (message) => {
    page.confirms.push(message);
    return page.confirmAnswer;
  };
  window.browser = browser;

  document.write(
    read(`${name}.html`).replace(/<script\b[^>]*><\/script>/gi, ""),
  );
  window.eval(read(`${name}.js`));
  await page.settle();
  return page;
}
