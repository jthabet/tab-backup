// Checks the translations in src/_locales against English and the code:
//  - every locale resolves for both browsers (see locales.mjs),
//  - languageTag matches the folder, so plural rules fit the text,
//  - every locale has every English message, no extra ones, none empty,
//  - plural messages have exactly the forms the language uses for counts
//    0–1000 (Russian one/few/many/other, Japanese other only…), since a
//    missing form would show the English text instead,
//  - translations keep the same $1, $2… substitutions; only a plural form
//    other than _other may leave out the count ($1): "your oldest backup",
//  - every key used in the pages and scripts exists,
//  - the description fits the Chrome Web Store's 132 characters.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { TARGETS, readLocales, resolveMessages } from "./locales.mjs";

const src = path.join(path.dirname(fileURLToPath(import.meta.url)), "../src");
const PLURAL_FORM = /_(zero|one|two|few|many|other)$/;
const problems = [];

const locales = readLocales(path.join(src, "_locales"));
if (!locales.en) throw new Error("src/_locales/en is missing");

// $1, $2… and named placeholders such as $FIRST$.
const placeholders = (text) =>
  [...new Set(text.match(/\$\d|\$\w+\$/g) ?? [])].sort().join(" ");

// The plural forms a language needs for the counts the UI shows.
function pluralForms(languageTag) {
  const rules = new Intl.PluralRules(languageTag);
  // _other is always required: it's also the fallback plural() uses.
  const forms = new Set(["other"]);
  for (let n = 0; n <= 1000; n++) forms.add(rules.select(n));
  return forms;
}

for (const [lang, messages] of Object.entries(locales)) {
  const tag = messages.languageTag?.message;
  if (tag !== lang.replace("_", "-")) {
    problems.push(
      `${lang}: languageTag is "${tag}", expected "${lang.replace("_", "-")}"`,
    );
  }
}

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
  const pluralBases = new Set(
    Object.keys(en)
      .filter((key) => key.endsWith("_other"))
      .map((key) => key.replace(PLURAL_FORM, "")),
  );

  for (const [lang, messages] of Object.entries(resolved)) {
    const where = `${lang} (${target})`;
    const forms = pluralForms(messages.languageTag?.message ?? lang);

    for (const [key, { message }] of Object.entries(messages)) {
      if (!message.trim()) problems.push(`${where}: ${key} is empty`);
    }
    for (const base of pluralBases) {
      for (const form of forms) {
        if (!messages[`${base}_${form}`]) {
          problems.push(`${where}: missing ${base}_${form}`);
        }
      }
    }
    for (const key of Object.keys(messages)) {
      const form = key.match(PLURAL_FORM)?.[1];
      const base = key.replace(PLURAL_FORM, "");
      if (form && pluralBases.has(base) && !forms.has(form)) {
        problems.push(
          `${where}: ${key} is never used (${lang} has no "${form}" form)`,
        );
      }
    }
    if (lang === "en") continue;

    for (const key of Object.keys(en)) {
      const form = key.match(PLURAL_FORM)?.[1];
      if (form && pluralBases.has(key.replace(PLURAL_FORM, ""))) continue;
      if (!messages[key]) problems.push(`${where}: missing ${key}`);
    }
    for (const [key, { message }] of Object.entries(messages)) {
      const form = key.match(PLURAL_FORM)?.[1];
      const base = key.replace(PLURAL_FORM, "");
      const plural = Boolean(form) && pluralBases.has(base);
      const english = plural ? en[`${base}_other`] : en[key];
      const used = (text) =>
        plural && form !== "other"
          ? placeholders(text).replace(/^\$1 ?/, "")
          : placeholders(text);
      if (!english) {
        problems.push(`${where}: ${key} isn't in English`);
      } else if (used(message) !== used(english.message)) {
        problems.push(
          `${where}: ${key} uses "${placeholders(message)}", English uses "${placeholders(english.message)}"`,
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
