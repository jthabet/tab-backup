// Translations live in src/_locales/<lang>/messages.json. A message whose
// wording differs per browser is written as key__firefox and key__chrome;
// the build keeps the one for its target as plain `key`, so the extension
// itself only ever looks up `key`.
import fs from "node:fs";
import path from "node:path";

export const TARGETS = ["firefox", "chrome"];

// Returns the messages for one browser, or throws if a variant has no
// counterpart for that browser.
export function resolveMessages(messages, target) {
  const resolved = {};
  const variants = new Map(); // base key -> { target: message }
  for (const [key, message] of Object.entries(messages)) {
    const [base, browser] = key.split("__");
    if (!browser) {
      resolved[base] = message;
      continue;
    }
    if (!TARGETS.includes(browser)) {
      throw new Error(`${key}: unknown browser "${browser}"`);
    }
    if (!variants.has(base)) variants.set(base, {});
    variants.get(base)[browser] = message;
  }
  for (const [base, byBrowser] of variants) {
    const message = byBrowser[target] ?? resolved[base];
    if (!message) {
      throw new Error(
        `${base}: no message for ${target} (add ${base}__${target} or ${base})`,
      );
    }
    resolved[base] = message;
  }
  return resolved;
}

export function readLocales(localesDir) {
  return Object.fromEntries(
    fs
      .readdirSync(localesDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map(({ name }) => [
        name,
        JSON.parse(
          fs.readFileSync(path.join(localesDir, name, "messages.json"), "utf8"),
        ),
      ]),
  );
}
