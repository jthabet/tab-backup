# Development and testing

## Setup

Requires Node.js 22 or later, [pnpm](https://pnpm.io/installation) 12, and
Firefox Developer Edition and/or Google Chrome Dev for `pnpm dev`.

```sh
pnpm install --frozen-lockfile
```

Browsers must load the compiled extension (`dist/` for Firefox, `dist-chrome/`
for Chromium), never `src/`: the sources import CSS that only webpack can
compile.

## Run it

The quickest way: rebuild on every change and open a browser with a temporary
profile and the extension already loaded, reloading it after each rebuild.

```sh
pnpm dev          # Firefox Developer Edition
pnpm dev:chrome   # Google Chrome Dev
```

The temporary profile has none of your tabs, accounts or add-ons, and is
deleted when you stop the command (`Ctrl+C`). The browser paths are set in
`webpack.config.mjs`. If `pnpm dev` says a profile is already in use, close the
browser window it opened earlier and run it again.

To test with your own profile and real tabs instead, build once (or keep
`pnpm start` / `pnpm start:chrome` running to rebuild on changes) and load the
extension by hand:

- **Firefox:** open `about:debugging#/runtime/this-firefox`, select **Load
  Temporary Add-on** and choose `dist/manifest.json`. It stays until Firefox
  restarts; select **Reload** after each rebuild.
- **Chrome, Brave, Edge:** open `chrome://extensions`, turn on **Developer
  mode**, select **Load unpacked** and choose `dist-chrome/`. Select the reload
  arrow after each rebuild.

To see runtime errors, select **Inspect** next to Tab Backup on
`about:debugging`, or **service worker** / **Errors** on `chrome://extensions`.

## Tests

```sh
pnpm test
```

Builds both versions, then runs the tests in Node, with no browser:
[`test/fake-browser.js`](../test/fake-browser.js) stands in for the extension
APIs. `pnpm lint` runs them too.

- Unit tests for the backup formats and file names, reading backups back in,
  translations and plural forms, and bookmark backups (in both Firefox's and
  Chrome's bookmark trees).
- Page tests ([`test/pages.test.js`](../test/pages.test.js)) open the built
  popup, restore and settings pages of each version in
  [happy-dom](https://github.com/capricorn86/happy-dom) and click through
  them: backing up to a file or bookmarks, restoring every sample format and
  bookmark backups, and changing each setting.

They can't catch what only a real browser shows (layout, the file picker,
permission prompts, the toolbar badge); the smoke test below does.

## Smoke test

Before a release, run through this in both browsers. Sample backups of three tabs in every format are in
[`samples/`](../samples/) for testing restore.

1. The toolbar badge shows the number of open tabs, and changes when you open
   or close one.
2. The popup lists the current window's tabs; selecting a title switches to
   that tab.
3. **Back up** saves a timestamped JSON file.
4. **Restore…** with that file shows a preview with already-open tabs
   unchecked; **Open** reopens the checked tabs.
5. In settings (gear button), pick another format and file name pattern; the
   next backup uses them and still restores.
6. In settings, choose **Bookmarks** and allow access. **Back up** creates a
   dated folder in Other Bookmarks › Tab Backup, which is listed on the restore
   page, where **Restore…**, **Rename** and **Delete** work. A renamed backup
   shows its date and tab count under its new name, and is skipped when the
   oldest backups are deleted.

## Translations

Every piece of text the user sees lives in
`src/_locales/<language>/messages.json`; English (`en`) is the default and
the fallback. To change or add text:

- **In a page**, put `data-i18n="key"` on the element (or
  `data-i18n-title` / `data-i18n-aria-label` for those attributes) and keep
  the English text in the HTML.
- **In a script**, use `t("key")`, or `plural("key", count)` for text that
  depends on a number: add `key_one` and `key_other` (and any other plural
  forms the language needs, such as `key_few`), with the count as `$1`.
- **If the wording differs per browser**, add `key__firefox` and
  `key__chrome` instead of `key`; the build keeps the right one.

Add the message to every language, then run:

```sh
pnpm check-locales
```

To add a language, copy `src/_locales/en` to `src/_locales/<code>` (for
example `de`), translate each `message` (the `description` explains where it
appears), and set `languageTag` to the code. Keep `$1`, `$2` and the
`{YYYY}`-style tokens exactly as they are.

To see a translation, switch the browser's language, or start Chrome in it:
`pnpm exec web-ext run -t chromium -s dist-chrome --arg=--lang=fr --arg=-AppleLanguages --arg="(fr)"`.

## Lint

```sh
pnpm lint
```

Checks the translations, runs the tests, builds `dist/` and runs Mozilla's add-on linter on it. It must report 0 errors
before a Firefox release. There is no equivalent for Chrome.

## Package

```sh
pnpm build && pnpm build-extension   # web-ext-artifacts/tab_backup-<version>.zip
pnpm build-extension:chrome          # web-ext-artifacts/tab_backup-chrome-<version>.zip
```

Regular Firefox only installs signed add-ons permanently, and Chrome only
installs from the store, so use the zips for store uploads and the steps above
for testing.

More detail: Mozilla's guides to
[temporary installation](https://extensionworkshop.com/documentation/develop/temporary-installation-in-firefox/)
and [`web-ext`](https://extensionworkshop.com/documentation/develop/getting-started-with-web-ext/).
