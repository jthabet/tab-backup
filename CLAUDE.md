# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Tab Backup is a Firefox (Manifest V3) extension that exports the current window's tabs to a timestamped JSON file and reopens tabs from such a file. Published on Firefox Add-ons. Plain DOM JavaScript (no UI framework) + Tailwind CSS v4, bundled with webpack/Babel. Package manager is **pnpm**.

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

- `src/` holds sources; Firefox must load the compiled `dist/`, never `src/` directly. Static markup (buttons, inline SVG icons, the file input) lives in `popup.html`/`options.html`; the JS only wires events and builds the tab list with `createElement` + `textContent` (never `innerHTML`, which the AMO linter flags). Tailwind scans the HTML and JS for class names. webpack (`webpack.config.mjs`, context `src/`) builds three entries — `background.js`, `popup.js`, `options.js` — and copies `manifest.json`, `popup.html`, `options.html`, and `icons/` verbatim into `dist/`. Any new static file must be added to the CopyWebpackPlugin patterns.
- **background.js**: keeps the toolbar badge set to the total tab count, listening on `tabs.onCreated`/`onRemoved` (with a workaround for Firefox bug 1396758 where `onRemoved` fires before the tab is gone).
- **popup.js**: lists current-window tabs (click to activate) and the **Back up** button, which serializes `[{title, url}]` to a Blob and saves it via `browser.downloads` as `tabs-DD-MM-YYYY_HH-mm.json`.
- **options.js**: the import flow. The popup's **Restore…** button opens the options page (in a tab, per `options_ui.open_in_tab`) and closes the popup; the file input there parses the JSON and calls `browser.tabs.create` for each entry. Keep import UI on the options page rather than the popup.
- The export JSON shape (`[{title, url}]`) is the contract between export and import — keep them compatible.
- Code uses the Firefox `browser.*` promise-based WebExtension API (not `chrome.*`). The Chrome-oriented `modern-web-guidance:chrome-extensions` skill is general guidance only.
- Styling: `src/main.css` imports Tailwind v4 with a custom `--height-128` theme token and a v3-compat border-color base layer. Prettier uses `prettier-plugin-tailwindcss` for class ordering.

## Versioning and release

- The extension version and add-on ID (`browser_specific_settings.gecko.id`, public on AMO) live in `src/manifest.json`; `package.json`'s version is unrelated.
- `make sign-extension` builds and signs `dist/`, reading the AMO API key/secret from 1Password via `op read`; `.env.example` holds the same `op://` references. In Makefile recipes, shell command substitution must be written `$$(...)`. Never inline real secrets.
