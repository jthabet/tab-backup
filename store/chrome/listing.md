# Chrome Web Store listing

Text and assets for the Chrome Web Store Developer Dashboard
(https://chrome.google.com/webstore/devconsole). Upload
`web-ext-artifacts/tab_backup-chrome-<version>.zip` from
`pnpm build-extension:chrome`.

## Package

The store shows the manifest's `name` and `description` as the extension's
name and summary, so they come from `src/manifest.json`:

- **Name:** Tab Backup
- **Summary (132 characters max):** Back up the tabs in your window to a file
  or a bookmark folder, then preview and restore them.

## Store listing tab

**Category:** Productivity → Tools

**Language:** English

**Description** (plain text; the store doesn't render Markdown or HTML):

```text
Back up every tab in the current window in one click, and bring them back whenever you need them.

BACK UP
• Save to a file: JSON, Markdown, plain text, or an HTML bookmarks file you can import into any browser.
• Or save to a bookmark folder that your browser's sync carries to your other devices.
• Name your files with date, time and tab count patterns.

RESTORE
• Preview a backup before anything opens, and choose which tabs come back.
• Tabs that are already open are left out automatically.
• Restore from any backup format, or straight from a bookmark backup.

PRIVATE BY DESIGN
Tab Backup doesn't collect or send any data. Your backups stay in your downloads folder or your own bookmarks. Bookmark access is only requested if you turn on bookmark backups, and Tab Backup only touches its own folder.

PERMISSIONS
• "Read your browsing history": needed to list the titles and addresses of the tabs you back up. Nothing is sent anywhere.
• "Manage your downloads": saves the backup file.
• "Read and change your bookmarks" (only if you turn on bookmark backups): creates and prunes the backup folder.

Source code and support: https://github.com/jthabet/tab-backup
Folder icon by Smashicons on Freepik: https://www.freepik.com/icon/folder_10773696
```

**Graphics** (in `store/chrome/`):

| Asset            | Size       | File                                   |
| ---------------- | ---------- | -------------------------------------- |
| Store icon       | 128 × 128  | `src/icons/folder_10773696-@128px.png` |
| Screenshot 1     | 1280 × 800 | `screenshots/1-popup.png`              |
| Screenshot 2     | 1280 × 800 | `screenshots/2-restore-preview.png`    |
| Screenshot 3     | 1280 × 800 | `screenshots/3-bookmark-backups.png`   |
| Screenshot 4     | 1280 × 800 | `screenshots/4-settings.png`           |
| Small promo tile | 440 × 280  | `promo-small-440x280.png`              |

Screenshots come from the Chromium build, so their wording matches what Chrome
users see (no Firefox Sync or Reader View).

**Homepage URL:** https://github.com/jthabet/tab-backup

**Support URL:** https://github.com/jthabet/tab-backup/issues

## Privacy tab

**Single purpose:**

```text
Backs up the tabs in the current window to a file or a bookmark folder, and restores them later.
```

**Permission justifications:**

| Permission             | Justification                                                                                                                                                                                                                                                                                                                 |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tabs`                 | Reads the title and URL of each tab in the current window so they can be listed in the popup, saved in a backup, and compared with open tabs when restoring. Nothing is sent off the device.                                                                                                                                  |
| `downloads`            | Saves the backup file (JSON, Markdown, plain text or HTML bookmarks) to the user's downloads folder when they click Back up.                                                                                                                                                                                                  |
| `storage`              | Saves the user's settings: backup format, file name pattern, destination, bookmark folder name and how many bookmark backups to keep.                                                                                                                                                                                         |
| `bookmarks` (optional) | Requested only when the user turns on bookmark backups in settings. Creates a dated folder of bookmarks for each backup inside the extension's own folder in Other Bookmarks, lists those backups for restoring, and deletes the oldest when the user's limit is reached. Other bookmarks are never read, changed or deleted. |

**Remote code:** No, I am not using remote code. All JavaScript is bundled in
the package.

**Data usage:** tick none of the data types. Tab titles and URLs are only read
on the device to make the backup the user asked for. They are never sent to
the developer or any third party. Settings and bookmark backups are kept in
the browser's own storage, which the browser may sync to the user's own
account. Then tick all three certifications:

- I do not sell or transfer user data to third parties, outside of the approved use cases.
- I do not use or transfer user data for purposes that are unrelated to my item's single purpose.
- I do not use or transfer user data to determine creditworthiness or for lending purposes.

**Privacy policy URL:** https://github.com/jthabet/tab-backup/blob/master/PRIVACY.md

## Distribution tab

- **Payments:** Free
- **Visibility:** Public
- **Regions:** All regions

## Account tab

A contact email must be set and verified before the first submission.

## Version history

| Version | Date       | Changes                                                                              | Status |
| ------- | ---------- | ------------------------------------------------------------------------------------ | ------ |
| 0.8.0   | 2026-10-22 | First Chrome Web Store release: file and bookmark backups, restore preview, settings | Draft  |
