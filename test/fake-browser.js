// A stand-in for the WebExtension `browser` API, enough to run the extension's
// modules in Node: i18n from the real message files, storage.sync in memory,
// and a bookmark tree shaped like Firefox's or Chromium's.
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readLocales, resolveMessages } from "../scripts/locales.mjs";

const LOCALES = readLocales(
  path.join(path.dirname(fileURLToPath(import.meta.url)), "../src/_locales"),
);

// Installs a fresh fake as globalThis.browser and returns it. `target` sets
// process.env.BROWSER, which the build would otherwise replace.
export function installBrowser({ target = "firefox", locale = "en" } = {}) {
  process.env.BROWSER = target;
  const fake = {
    i18n: fakeI18n(target, locale),
    storage: { sync: fakeStorage() },
    bookmarks: target === "firefox" ? firefoxBookmarks() : chromeBookmarks(),
  };
  globalThis.browser = fake;
  return fake;
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
  return {
    async get(defaults) {
      return { ...defaults, ...structuredClone(data) };
    },
    async set(changes) {
      Object.assign(data, structuredClone(changes));
    },
  };
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

  return {
    nodes,
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
    },
    // Test helper: the titles of a folder's children.
    titles(id) {
      return lookup(id).childIds.map((child) => nodes.get(child).title);
    },
  };
}
