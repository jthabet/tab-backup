// Checks the translations in src/_locales against English and the code:
//  - every locale resolves for both browsers (see locales.mjs),
//  - every locale has every English message, and no extra ones,
//  - translations keep the same $1, $2… substitutions,
//  - every key used in the pages and scripts exists,
//  - the description fits the Chrome Web Store's 132 characters.
// Plural forms (key_one, key_few…) vary by language; only key_other is
// required everywhere, and a form may leave out the count ($1).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { TARGETS, readLocales, resolveMessages } from "./locales.mjs";

const src = path.join(path.dirname(fileURLToPath(import.meta.url)), "../src");
const PLURAL_FORM = /_(zero|one|two|few|many|other)$/;
const problems = [];

const locales = readLocales(path.join(src, "_locales"));
if (!locales.en) throw new Error("src/_locales/en is missing");

const placeholders = (text) =>
  [...new Set(text.match(/\$\d/g) ?? [])].sort().join(" ");
const required = (keys) =>
  new Set(
    [...keys].filter((key) => !PLURAL_FORM.test(key) || key.endsWith("_other")),
  );

for (const target of TARGETS) {
  const resolved = {};
  for (const [lang, messages] of Object.entries(locales)) {
    try {
      resolved[lang] = resolveMessages(messages, target);
    } catch (error) {
      problems.push(`${lang} (${target}): ${error.message}`);
    }
  }
  const en = resolved.en;
  if (!en) continue;

  for (const [lang, messages] of Object.entries(resolved)) {
    if (lang === "en") continue;
    for (const key of required(Object.keys(en))) {
      if (!messages[key]) problems.push(`${lang} (${target}): missing ${key}`);
    }
    for (const [key, { message }] of Object.entries(messages)) {
      const base = key.replace(PLURAL_FORM, "");
      const plural = PLURAL_FORM.test(key);
      const english = plural ? en[`${base}_other`] : en[key];
      // A plural form may leave out the count ($1): "your oldest backup".
      const used = (text) =>
        plural ? placeholders(text).replace(/^\$1 ?/, "") : placeholders(text);
      if (!english) {
        problems.push(`${lang} (${target}): ${key} isn't in English`);
      } else if (used(message) !== used(english.message)) {
        problems.push(
          `${lang} (${target}): ${key} uses "${placeholders(message)}", English uses "${placeholders(english.message)}"`,
        );
      }
    }
  }

  for (const [lang, messages] of Object.entries(resolved)) {
    const length = messages.extensionDescription?.message.length ?? 0;
    if (length > 132)
      problems.push(
        `${lang} (${target}): extensionDescription is ${length} characters (132 max)`,
      );
  }

  // Keys used in the code. Plural keys are used without their form suffix.
  const files = fs
    .readdirSync(src)
    // i18n.js only mentions keys in comments.
    .filter((file) => /\.(html|js|json)$/.test(file) && file !== "i18n.js");
  for (const file of files) {
    const text = fs.readFileSync(path.join(src, file), "utf8");
    const used = [
      ...[...text.matchAll(/data-i18n(?:-[a-z-]+)?="([^"]+)"/g)].map(
        (m) => m[1],
      ),
      ...[...text.matchAll(/\bt\(\s*"([^"]+)"/g)].map((m) => m[1]),
      ...[...text.matchAll(/__MSG_(\w+)__/g)].map((m) => m[1]),
    ];
    for (const key of used) {
      if (!en[key])
        problems.push(`${file}: uses ${key}, which isn't in en (${target})`);
    }
    for (const [, key] of text.matchAll(/\bplural\(\s*"([^"]+)"/g)) {
      if (!en[`${key}_other`])
        problems.push(
          `${file}: uses plural ${key}, but en has no ${key}_other (${target})`,
        );
    }
  }
}

if (problems.length) {
  console.error([...new Set(problems)].join("\n"));
  process.exit(1);
}
console.log(`Translations OK: ${Object.keys(locales).sort().join(", ")}`);
