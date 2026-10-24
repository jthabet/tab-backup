# Tab Backup

![Tab Backup folder icon](./src/icons/folder_10773696-@128px.png)

Back up every tab in the current window in one click, and bring them back
whenever you need them. Works in Firefox and Chrome (and Brave, Edge and other
Chromium browsers).

- [Install from Firefox Add-ons](https://addons.mozilla.org/en-GB/firefox/addon/tab-backup/)
- [Install from the Chrome Web Store](https://chromewebstore.google.com/detail/gapfigidccddefbabbcfcnapckpcdeap)

## Features

- **Back up** to a file (JSON, Markdown, plain text or HTML bookmarks), to a
  bookmark folder that your browser syncs to your other devices, or both.
- **Restore** from any backup with a preview: choose which tabs come back, and
  tabs that are already open are left out.
- **Settings** for the file format, file name pattern, bookmark folder name and
  how many bookmark backups to keep.

Available in English, Dutch, French, German, Italian, Japanese, Russian and Turkish. Tab Backup doesn't collect or send any data. See the
[privacy policy](PRIVACY.md).

## Build from source

Requires Node.js 22 or later and [pnpm](https://pnpm.io/installation) 12.

```sh
pnpm install --frozen-lockfile
pnpm build          # Firefox build in dist/
pnpm build:chrome   # Chromium build in dist-chrome/
```

These steps reproduce the files submitted to the stores. The built folders
contain bundled, minified code built by webpack from `src/`.

- [Development and testing](docs/DEVELOPMENT.md)
- [Releasing a new version](docs/RELEASE.md)

## Credits

The button and page icons are drawn for Tab Backup. The folder icon is by
[Smashicons on Freepik](https://www.freepik.com/icon/folder_10773696).
