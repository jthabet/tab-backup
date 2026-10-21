# Tab Backup

![Tab Backup folder icon](./src/icons/folder_10773696-@128px.png)

A Firefox extension for backing up the tabs in the current window to a file
(JSON, Markdown, plain text or HTML bookmarks) and restoring tabs from a
previous backup.

[Install Tab Backup from Firefox Add-ons](https://addons.mozilla.org/en-GB/firefox/addon/tab-backup/)

## Requirements

- Node.js 22 or later
- [pnpm](https://pnpm.io/installation) 12
- Firefox or Firefox Developer Edition

## Install dependencies

```sh
pnpm install --frozen-lockfile
```

## Test in Firefox

Firefox must load the compiled extension from `dist`. The files in `src`
import CSS that webpack compiles with Tailwind, so they cannot be loaded
directly.

### Manual testing

This workflow works with any local Firefox installation:

1. Build the extension:

   ```sh
   pnpm build
   ```

2. Open `about:debugging` in Firefox.
3. Select **This Firefox**.
4. Select **Load Temporary Add-on**.
5. Choose `dist/manifest.json` from this repository.

The temporary extension remains installed until it is removed or Firefox is
restarted. After changing the source, run `pnpm build` again and select
**Reload** next to Tab Backup on the `about:debugging` page.

### Watch mode

To rebuild `dist` whenever a source file changes, run:

```sh
pnpm start
```

Load `dist/manifest.json` using the [manual testing](#manual-testing) workflow.
After a rebuild, select **Reload** next to Tab Backup on `about:debugging`.
Press `Ctrl+C` to stop watching.

### Firefox Developer Edition

To rebuild on changes and also launch Firefox Developer Edition with the
extension installed and reloaded automatically, run:

```sh
pnpm dev
```

The temporary profile does not contain your usual tabs, accounts, settings, or
installed add-ons, and its changes are discarded when the process stops. The
Firefox executable is configured in `webpack.config.mjs`.

To run `web-ext` directly against an existing build (it reads the `webExt`
settings in `package.json`, which point at `dist` and Developer Edition):

```sh
pnpm exec web-ext run --devtools
```

To test Tab Backup with your existing Firefox profile and real tabs, keep your
normal Firefox window open and use the [manual testing](#manual-testing)
workflow instead. Loading `dist/manifest.json` from `about:debugging` installs
the extension temporarily in that running profile without configuring webpack
to write to your everyday profile.

If `pnpm dev` reports that a profile is already in use, close the
Firefox window previously opened by the command and run it again. A dedicated
reusable development profile can also be selected with the `firefoxProfile`
option in `webpack.config.mjs`, but it should not point to a profile used for
everyday browsing.

### Suggested smoke test

1. Confirm the toolbar badge shows the number of open tabs.
2. Open the extension popup and confirm the current window's tabs are listed.
3. Select a tab title and confirm Firefox activates that tab.
4. Select **Back up** and confirm a timestamped JSON file is saved.
5. Select **Restore…**, choose the exported file, and confirm its tabs reopen.
6. Open settings with the sliders button, pick another format and file name
   pattern, and confirm the next backup uses them and still restores.
7. Open and close a tab and confirm the badge count changes.

To inspect runtime errors, find Tab Backup on `about:debugging` and select
**Inspect**.

To check the built extension with Mozilla's add-on linter, run:

```sh
pnpm lint
```

For more detail, see Mozilla's guides to
[temporary installation](https://extensionworkshop.com/documentation/develop/temporary-installation-in-firefox/)
and [`web-ext`](https://extensionworkshop.com/documentation/develop/getting-started-with-web-ext/).

## Build a package

```sh
pnpm build
pnpm build-extension
```

The packaged extension is written to `web-ext-artifacts`. Regular Firefox
builds require extensions to be signed for permanent installation; use the
temporary installation workflow above for local development.

The `web-ext` configuration is in `package.json` and the webpack integration is
in `webpack.config.mjs`.

## Build from source

These steps reproduce the files submitted to Firefox Add-ons. The `dist`
folder contains bundled and minified code built by webpack from `src`.

1. Install Node.js 22 or later and pnpm 12.
2. Install the exact dependency versions from `pnpm-lock.yaml`:

   ```sh
   pnpm install --frozen-lockfile
   ```

3. Build the extension into `dist`:

   ```sh
   pnpm build
   ```

## Release to Firefox Add-ons

Replace `0.7.0` with the new version in every command. Each release needs a
version higher than the one already on Firefox Add-ons.

1. Start from an up-to-date `main`:

   ```sh
   git switch main
   git pull --ff-only
   pnpm install --frozen-lockfile
   ```

2. Run the [smoke test](#suggested-smoke-test) with `pnpm dev`, then press
   `Ctrl+C`.
3. Set the new version in `src/manifest.json`:

   ```sh
   sed -i '' -E 's/"version": "[^"]+"/"version": "0.7.0"/' src/manifest.json
   ```

4. Build and lint. This must report 0 errors:

   ```sh
   pnpm lint
   ```

5. Commit, tag and push the release:

   ```sh
   git add src/manifest.json
   git commit -m "release: 0.7.0"
   git tag v0.7.0
   git push origin main v0.7.0
   ```

6. Package the extension and zip the source code for Mozilla's reviewers:

   ```sh
   pnpm build-extension
   git archive --format=zip -o web-ext-artifacts/tab_backup-0.7.0-source.zip v0.7.0
   ```

7. Submit the new version. This reads the AMO API key and secret from
   1Password, then waits up to 15 minutes for approval; if it times out, the
   submission still went through.

   ```sh
   pnpm exec web-ext sign --channel=listed --api-key="$(op read 'op://dev/Firefox add-on/username')" --api-secret="$(op read 'op://dev/Firefox add-on/credential')" --upload-source-code=web-ext-artifacts/tab_backup-0.7.0-source.zip
   ```

8. Check the review status and add release notes in the
   [Add-on Developer Hub](https://addons.mozilla.org/developers/addons).
9. Bring `wip` up to date before continuing work:

   ```sh
   git switch wip
   git merge --ff-only main
   ```

## Assets

The button and page icons are drawn for Tab Backup. The folder icon is by
[Smashicons on Freepik](https://www.freepik.com/icon/folder_10773696).
