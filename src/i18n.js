// Translations come from _locales/<lang>/messages.json, picked by the browser
// for the user's language with English as the fallback.

// The translation's own language, so plural rules and dates match the text
// shown.
export const language = browser.i18n.getMessage("languageTag") || "en";
const pluralRules = new Intl.PluralRules(language);

// Returns the message for `key`, with $1, $2… replaced by `substitutions`.
export function t(key, ...substitutions) {
  const message = browser.i18n.getMessage(key, substitutions.map(String));
  if (!message) console.warn(`Missing message: ${key}`);
  return message || key;
}

// Messages that depend on a count are written as key_one, key_other, and
// whatever other plural forms the language needs (key_few, key_many…).
// The count is $1; further substitutions are $2, $3…
export function plural(key, count, ...substitutions) {
  const form = pluralRules.select(count);
  const args = [String(count), ...substitutions.map(String)];
  return (
    browser.i18n.getMessage(`${key}_${form}`, args) ||
    t(`${key}_other`, ...args)
  );
}

// Fills elements marked data-i18n="key" (text) and data-i18n-title,
// data-i18n-aria-label (attributes). The HTML keeps the English text so
// pages still read sensibly before this runs.
export function localizePage() {
  document.documentElement.lang = language;
  for (const element of document.querySelectorAll("[data-i18n]")) {
    element.textContent = t(element.dataset.i18n);
  }
  for (const attribute of ["title", "aria-label"]) {
    for (const element of document.querySelectorAll(
      `[data-i18n-${attribute}]`,
    )) {
      element.setAttribute(
        attribute,
        t(element.getAttribute(`data-i18n-${attribute}`)),
      );
    }
  }
}
