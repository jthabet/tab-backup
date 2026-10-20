// Backup file formats. JSON ([{title, url}]) is the one restore reads back
// in full; for the others, restore extracts the links.
export const FORMATS = {
  json: {
    extension: "json",
    type: "application/json",
    serialize: (tabs) =>
      JSON.stringify(
        tabs.map(({ title, url }) => ({ title, url })),
        null,
        2,
      ),
  },
  markdown: {
    extension: "md",
    type: "text/markdown",
    // <url> keeps links with spaces or parentheses intact.
    serialize: (tabs) =>
      tabs
        .map(
          ({ title, url }) => `- [${escapeMarkdown(title || url)}](<${url}>)`,
        )
        .join("\n") + "\n",
  },
  text: {
    extension: "txt",
    type: "text/plain",
    serialize: (tabs) => tabs.map(({ url }) => url).join("\n") + "\n",
  },
  html: {
    extension: "html",
    type: "text/html",
    // Netscape bookmark file, which every major browser can import.
    serialize: (tabs, { folder }) =>
      [
        "<!DOCTYPE NETSCAPE-Bookmark-file-1>",
        '<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">',
        "<TITLE>Bookmarks</TITLE>",
        "<H1>Bookmarks</H1>",
        "<DL><p>",
        `    <DT><H3>${escapeHtml(folder)}</H3>`,
        "    <DL><p>",
        ...tabs.map(
          ({ title, url }) =>
            `        <DT><A HREF="${escapeHtml(url)}">${escapeHtml(title || url)}</A>`,
        ),
        "    </DL><p>",
        "</DL><p>",
        "",
      ].join("\n"),
  },
};

const FILENAME_TOKENS = /\{(YYYY|MM|DD|HH|mm|ss|count)\}/g;

// Fills {YYYY} {MM} {DD} {HH} {mm} {ss} {count} in a file name pattern,
// without the extension. Characters that are invalid in file names on
// Windows or macOS are replaced, since downloads.download rejects them.
export function formatFilename(pattern, date, count) {
  const pad = (n) => String(n).padStart(2, "0");
  const values = {
    YYYY: String(date.getFullYear()),
    MM: pad(date.getMonth() + 1),
    DD: pad(date.getDate()),
    HH: pad(date.getHours()),
    mm: pad(date.getMinutes()),
    ss: pad(date.getSeconds()),
    count: String(count),
  };
  const name = pattern
    .replace(FILENAME_TOKENS, (_, token) => values[token])
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, "-")
    .replace(/^[\s.]+|[\s.]+$/g, "");
  return name || "tabs";
}

function escapeMarkdown(text) {
  return text.replace(/[\\[\]<]/g, "\\$&");
}

function escapeHtml(text) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
