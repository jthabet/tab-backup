# Sample backups

The same three tabs saved in each backup format, for testing restore without
making a backup first:

| File              | Format                                            |
| ----------------- | ------------------------------------------------- |
| `three-tabs.json` | JSON (restores titles and every URL exactly)      |
| `three-tabs.md`   | Markdown                                          |
| `three-tabs.txt`  | Plain text                                        |
| `three-tabs.html` | HTML bookmarks (also importable into any browser) |

Open the restore page (**Restore…** in the popup), choose one of these files,
and check the preview lists The Go Programming Language, GitHub and Overview -
Claude Code Docs (the tabs `pnpm dev` opens by default plus the Claude Code
docs).

The files were generated with `src/formats.js`; regenerate them if a format
changes.
