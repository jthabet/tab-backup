// A stand-in for the WebExtension `browser` API, enough to run the
// extension's modules and pages in Node: i18n from the real message files,
// storage, permissions, tabs and downloads in memory, and a bookmark tree
// shaped like Firefox's or Chromium's. Tests read and set its state directly
// (e.g. `fake.tabs.open`, `fake.downloads.saved`).
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readLocales, resolveMessages } from "../scripts/locales.mjs";

const LOCALES = readLocales(
  path.join(path.dirname(fileURLToPath(import.meta.url)), "../src/_locales"),
);

// A fresh fake for one browser and UI language.
export function createBrowser({
  target = "firefox",
  locale = "en",
  tabs = [],
  bookmarksAllowed = true,
} = {}) {
  return {
    i18n: fakeI18n(target, locale),
    storage: { sync: fakeStorage() },
    permissions: fakePermissions(bookmarksAllowed ? ["bookmarks"] : []),
    bookmarks: target === "firefox" ? firefoxBookmarks() : chromeBookmarks(),
    tabs: fakeTabs(tabs),
    downloads: fakeDownloads(),
    runtime: fakeRuntime(target),
    action: fakeAction(),
  };
}

// Installs a fresh fake as globalThis.browser and returns it. `target` sets
// process.env.BROWSER, which the build would otherwise replace.
export function installBrowser(options = {}) {
  process.env.BROWSER = options.target ?? "firefox";
  globalThis.browser = createBrowser(options);
  return globalThis.browser;
}

// browser.*.onSomething: listeners the fake calls when its state changes.
function fakeEvent() {
  const listeners = new Set();
  return {
    addListener: (fn) => listeners.add(fn),
    removeListener: (fn) => listeners.delete(fn),
    hasListener: (fn) => listeners.has(fn),
    fire: (...args) => listeners.forEach((fn) => fn(...args)),
  };
}

// Like browser.i18n.getMessage: the locale's message, else English's (also
// for a browser language with no translation), with named placeholders and
// then $1…$9 filled in; "" when the key is missing.
function fakeI18n(target, locale) {
  const english = resolveMessages(LOCALES.en, target);
  const messages = LOCALES[locale]
    ? resolveMessages(LOCALES[locale], target)
    : english;
  return {
    getMessage(key, substitutions = []) {
      const entry = messages[key] ?? english[key];
      if (!entry) return "";
      const fill = (text) =>
        text.replace(/\$(\d)/g, (_, n) => substitutions[n - 1] ?? "");
      let text = entry.message;
      for (const [name, { content }] of Object.entries(
        entry.placeholders ?? {},
      )) {
        text = text.replaceAll(
          new RegExp(`\\$${name}\\$`, "gi"),
          fill(content),
        );
      }
      return fill(text);
    },
  };
}

function fakeStorage() {
  const data = {};
  const onChanged = fakeEvent();
  return {
    data,
    onChanged,
    async get(defaults) {
      return { ...defaults, ...structuredClone(data) };
    },
    async set(changes) {
      Object.assign(data, structuredClone(changes));
      onChanged.fire(
        Object.fromEntries(
          Object.entries(changes).map(([key, newValue]) => [key, { newValue }]),
        ),
      );
    },
  };
}

// Optional permissions; `answer` is what the user picks in the prompt.
function fakePermissions(granted) {
  const permissions = {
    granted: new Set(granted),
    answer: true,
    requests: 0,
    onAdded: fakeEvent(),
    async contains({ permissions: wanted }) {
      return wanted.every((p) => permissions.granted.has(p));
    },
    async request({ permissions: wanted }) {
      permissions.requests++;
      if (!permissions.answer) return false;
      wanted.forEach((p) => permissions.granted.add(p));
      permissions.onAdded.fire({ permissions: wanted, origins: [] });
      return true;
    },
  };
  return permissions;
}

// Tabs in the current window; `created` and `activated` record what pages did,
// and `queries` counts calls to query().
function fakeTabs(initial) {
  let nextId = 1;
  const open = initial.map((tab) => ({ id: nextId++, ...tab }));
  const tabs = {
    open,
    created: [],
    activated: [],
    queries: 0,
    onCreated: fakeEvent(),
    onRemoved: fakeEvent(),
    async query() {
      tabs.queries++;
      return structuredClone(open);
    },
    async create(properties) {
      const tab = {
        id: nextId++,
        title: "",
        url: "about:newtab",
        ...properties,
      };
      // A copy made here, since pages pass objects from their own realm,
      // which deepStrictEqual never matches.
      tabs.created.push({ ...properties });
      open.push(tab);
      return tab;
    },
    async update(id, changes) {
      if (changes.active) tabs.activated.push(id);
      return open.find((tab) => tab.id === id);
    },
  };
  return tabs;
}

// Downloads complete at once. `saved` holds { filename, url }; a page test
// reads the file's contents from the blob behind `url`.
function fakeDownloads() {
  let nextId = 1;
  const downloads = {
    saved: [],
    onChanged: fakeEvent(),
    async download({ url, filename }) {
      const id = nextId++;
      downloads.saved.push({ id, url, filename });
      return id;
    },
    async search({ id }) {
      return downloads.saved.some((d) => d.id === id)
        ? [{ id, state: "complete" }]
        : [];
    },
  };
  return downloads;
}

function fakeRuntime(target) {
  const base =
    target === "firefox" ? "moz-extension://test/" : "chrome-extension://test/";
  const runtime = {
    optionsOpened: 0,
    onInstalled: fakeEvent(),
    onStartup: fakeEvent(),
    getURL: (file) => base + file,
    async openOptionsPage() {
      runtime.optionsOpened++;
    },
  };
  return runtime;
}

// The toolbar button's badge; `textUpdates` counts setBadgeText calls.
function fakeAction() {
  const action = {
    badgeText: "",
    badgeColor: null,
    textUpdates: 0,
    async setBadgeText({ text }) {
      action.badgeText = text;
      action.textUpdates++;
    },
    async setBadgeBackgroundColor({ color }) {
      action.badgeColor = color;
    },
  };
  return action;
}

// --- Bookmarks ---

// Firefox: string IDs, `type` on every node.
function firefoxBookmarks() {
  return bookmarkTree({
    rootId: "root________",
    topFolders: [
      { id: "menu________", title: "Bookmarks Menu" },
      { id: "toolbar_____", title: "Bookmarks Toolbar" },
      { id: "unfiled_____", title: "Other Bookmarks" },
      { id: "mobile______", title: "Mobile Bookmarks" },
    ],
    withType: true,
  });
}

// Chromium: no `type`; folders have no url, top folders have `folderType`,
// and a signed-in profile can hold a local and a synced copy of each.
function chromeBookmarks() {
  return bookmarkTree({
    rootId: "0",
    topFolders: [
      {
        id: "1",
        title: "Bookmarks bar",
        folderType: "bookmarks-bar",
      },
      {
        id: "2",
        title: "Other bookmarks",
        folderType: "other",
      },
      {
        id: "3",
        title: "Mobile bookmarks",
        folderType: "mobile",
      },
    ],
    withType: false,
    topFolderDefaults: { syncing: false },
  });
}

function bookmarkTree({
  rootId,
  topFolders,
  withType,
  topFolderDefaults = {},
}) {
  const nodes = new Map();
  let nextId = 100;
  let clock = Date.UTC(2026, 0, 1);

  const add = (node) => {
    nodes.set(node.id, node);
    if (node.parentId) {
      const siblings = nodes.get(node.parentId).childIds;
      siblings.splice(node.index ?? siblings.length, 0, node.id);
    }
    return node;
  };
  add({ id: rootId, title: "", childIds: [] });
  for (const folder of topFolders) {
    add({ ...topFolderDefaults, ...folder, parentId: rootId, childIds: [] });
  }

  // What the API returns: a copy, with index and (for folders) no url.
  const view = (node) => {
    const out = { id: node.id, title: node.title, dateAdded: node.dateAdded };
    if (node.parentId) {
      out.parentId = node.parentId;
      out.index = nodes.get(node.parentId).childIds.indexOf(node.id);
    }
    if (node.url) out.url = node.url;
    if (withType) out.type = node.url ? "bookmark" : "folder";
    if (node.folderType) out.folderType = node.folderType;
    if (node.syncing !== undefined) out.syncing = node.syncing;
    return out;
  };
  const subtree = (node) => ({
    ...view(node),
    ...(node.url
      ? {}
      : { children: node.childIds.map((id) => subtree(nodes.get(id))) }),
  });
  const lookup = (id) => {
    const node = nodes.get(id);
    if (!node) throw new Error(`Can't find bookmark for id ${id}`);
    return node;
  };

  const onCreated = fakeEvent();
  const onRemoved = fakeEvent();
  const onChanged = fakeEvent();

  return {
    nodes,
    onCreated,
    onRemoved,
    onChanged,
    // Adds a top-level folder, e.g. a synced copy of Other bookmarks.
    addTopFolder(folder) {
      add({ ...folder, parentId: rootId, childIds: [] });
    },
    async create({ parentId, index, title = "", url }) {
      lookup(parentId);
      // Browsers refuse to bookmark privileged pages such as about:newtab.
      if (url && !/^(https?|ftp|file):/i.test(url)) {
        throw new Error(`Can't bookmark ${url}`);
      }
      const node = add({
        id: String(nextId++),
        parentId,
        index,
        title,
        url,
        dateAdded: clock++,
        childIds: url ? undefined : [],
      });
      onCreated.fire(node.id, view(node));
      return view(node);
    },
    async get(ids) {
      return [].concat(ids).map((id) => view(lookup(id)));
    },
    async getChildren(id) {
      return lookup(id).childIds.map((child) => view(nodes.get(child)));
    },
    async getSubTree(id) {
      return [subtree(lookup(id))];
    },
    async search({ url }) {
      return [...nodes.values()].filter((node) => node.url === url).map(view);
    },
    async update(id, { title }) {
      const node = lookup(id);
      node.title = title;
      onChanged.fire(id, { title });
      return view(node);
    },
    async removeTree(id) {
      const node = lookup(id);
      const drop = (n) => {
        n.childIds?.forEach((child) => drop(nodes.get(child)));
        nodes.delete(n.id);
      };
      const siblings = nodes.get(node.parentId).childIds;
      siblings.splice(siblings.indexOf(id), 1);
      drop(node);
      onRemoved.fire(id, { parentId: node.parentId });
    },
    // Test helper: the titles of a folder's children.
    titles(id) {
      return lookup(id).childIds.map((child) => nodes.get(child).title);
    },
  };
}
