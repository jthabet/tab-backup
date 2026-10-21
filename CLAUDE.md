# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Tab Backup is a Firefox (Manifest V3) extension that backs up the current window's tabs to a file (JSON, Markdown, plain text or HTML bookmarks) and/or a synced bookmark folder, and reopens tabs from either. Published on Firefox Add-ons. Plain DOM JavaScript (no UI framework) + Tailwind CSS v4, bundled with webpack/Babel. Package manager is **pnpm**.

## Commands

```sh
pnpm install
pnpm build            # production build into dist/
pnpm start            # webpack watch, rebuilds dist/ (no Firefox launch)
pnpm dev              # watch + launch Firefox Developer Edition with a temp profile via web-ext-plugin
pnpm lint             # build, then web-ext lint on dist/ (not ESLint)
pnpm build-extension  # package dist/ into web-ext-artifacts/ (run after pnpm build)
pnpm exec web-ext run # run an existing dist/ build in Developer Edition (webExt config in package.json)
make                  # clean + build + package
```

There is no automated test suite. Verify changes by loading `dist/manifest.json` via `about:debugging` → This Firefox → Load Temporary Add-on (Reload after each rebuild), and running the smoke test in `README.md`. Use **Inspect** on `about:debugging` for runtime errors.

The `webExt` key in `package.json` must keep `sourceDir: "dist"`; `src/` imports CSS that only webpack can resolve, so web-ext cannot lint or load it.

## Architecture

- `src/` holds sources; Firefox must load the compiled `dist/`, never `src/` directly. Static markup (buttons, inline SVG icons, form controls) lives in the HTML pages; the JS only wires events and builds dynamic content with `createElement` + `textContent` (never `innerHTML`, which the AMO linter flags). Tailwind scans the HTML and JS for class names. webpack (`webpack.config.mjs`, context `src/`, `output.clean`) builds four entries — `background.js`, `popup.js`, `restore.js`, `settings.js` — and copies `manifest.json`, `popup.html`, `restore.html`, `settings.html`, and `icons/` verbatim into `dist/`. Any new page must be added to both `entry` and the CopyWebpackPlugin patterns.
- **background.js**: keeps the toolbar badge set to the total tab count, listening on `tabs.onCreated`/`onRemoved` (with a workaround for Firefox bug 1396758 where `onRemoved` fires before the tab is gone).
- **popup.js**: lists current-window tabs (click to activate). **Back up** serializes them with the format and file name pattern from settings and saves via `browser.downloads`; **Restore…** opens `restore.html` in a tab; the gear button opens the settings page.
- **restore.js**: the import flow, plus the list of bookmark backups (refreshed on `bookmarks.on*` events). Every restore (file or bookmark backup) first shows a preview with a checkbox per tab; tabs already open in any window start unchecked and unopenable URLs are listed but not selectable. Reads JSON backups fully and extracts http(s) links from Markdown, plain-text and HTML-bookmark backups, then calls `browser.tabs.create` per URL (mapping `about:newtab`/Reader View, skipping privileged URLs). Keep import UI on its own page rather than the popup, since the popup closes when the file picker opens.
- **bookmark-backups.js**: optional bookmark destination. Each backup is a dated folder under Other Bookmarks › Tab Backup (root folder id cached in `storage.local`; all same-named roots are read, since each device may create one before syncing), pruned to the newest `keepBookmarkBackups`. `bookmarks` is an `optional_permissions` entry requested from the settings page, so updates never prompt existing users; `permissions.request` must be called synchronously inside the user's change handler. If access was revoked, Back up falls back to a file.
- **settings.js** (`options_ui` page): destination (file, bookmarks or both), bookmark retention, backup format and file name pattern, auto-saved to `browser.storage.sync` (synced across the user's Firefox devices). Defaults and accessors live in `settings-store.js`; formats and the `{YYYY} {MM} {DD} {HH} {mm} {ss} {count}` file name tokens live in `formats.js`.
- The JSON shape (`[{title, url}]`) is the contract between export and import — keep them compatible. Other formats only need to keep their links extractable by `parseBackup` in `restore.js`.
- Code uses the Firefox `browser.*` promise-based WebExtension API (not `chrome.*`). The Chrome-oriented `modern-web-guidance:chrome-extensions` skill is general guidance only.
- Styling: `src/main.css` imports Tailwind v4 with a custom `--height-128` theme token and a v3-compat border-color base layer. Prettier uses `prettier-plugin-tailwindcss` for class ordering.

## Versioning and release

- The extension version and add-on ID (`browser_specific_settings.gecko.id`, public on AMO) live in `src/manifest.json`; `package.json`'s version is unrelated.
- The full release procedure (version bump, tag, source zip for AMO reviewers, `web-ext sign --channel=listed --upload-source-code`) is in the README's "Release to Firefox Add-ons" section. `pnpm-lock.yaml` is committed so reviewers can reproduce the build with `pnpm install --frozen-lockfile`.
- `make sign-extension` builds and signs `dist/`, reading the AMO API key/secret from 1Password via `op read`; `.env.example` holds the same `op://` references. In Makefile recipes, shell command substitution must be written `$$(...)`. Never inline real secrets.
