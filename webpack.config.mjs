import path from "path";
import { fileURLToPath } from "url";
import webpack from "webpack";
import CopyWebpackPlugin from "copy-webpack-plugin";
import WebExtPlugin from "web-ext-plugin";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Firefox-specific wording in the pages, rewritten for the Chromium build.
// Each pattern must match, so copy changes can't silently skip the rewrite.
const CHROME_COPY = {
  "settings.html": [
    [/by\s+Firefox Sync\./, "by your browser's sync."],
    [
      /signed in to Firefox and\s+add-on sync is on\./,
      "signed in to your browser with sync on.",
    ],
  ],
  "restore.html": [
    [/once\s+Firefox Sync has run\./, "once your browser has synced."],
  ],
};

function rewriteCopy(file, content) {
  let html = content.toString();
  for (const [pattern, replacement] of CHROME_COPY[file] ?? []) {
    if (!pattern.test(html))
      throw new Error(`${file}: no match for ${pattern}`);
    html = html.replace(pattern, replacement);
  }
  return html;
}

// Chromium wants a service worker instead of background scripts, and
// rejects or warns about Firefox-only keys.
function toChromeManifest(content) {
  const manifest = JSON.parse(content.toString());
  delete manifest.browser_specific_settings;
  delete manifest.action.theme_icons;
  manifest.background = { service_worker: "background.js" };
  manifest.icons = Object.fromEntries(
    [16, 32, 64, 128].map((size) => [
      size,
      `icons/folder_10773696-@${size}px.png`,
    ]),
  );
  // Chrome 148 is the first with the browser.* namespace the code uses.
  manifest.minimum_chrome_version = "148";
  return JSON.stringify(manifest, null, 2);
}

export default (env = {}) => {
  const chrome = env.target === "chrome";
  const launchBrowser = env.launchBrowser !== "false";

  return {
    mode: "production",
    context: path.resolve(__dirname, "src"),
    entry: {
      background: "./background.js",
      popup: "./popup.js",
      restore: "./restore.js",
      settings: "./settings.js",
    },
    output: {
      path: path.resolve(__dirname, chrome ? "dist-chrome" : "dist"),
      filename: "[name].js",
      // Remove files from earlier builds so stale pages never get packaged.
      clean: true,
    },
    watchOptions: {
      ignored: ["**/node_modules/**", "**/dist/**", "**/.git/**"],
      poll: 1000,
    },
    module: {
      rules: [
        {
          test: /\.m?js$/,
          exclude: /node_modules/,
          use: {
            loader: "babel-loader",
            options: {
              presets: ["@babel/preset-env"],
            },
          },
        },
        {
          test: /\.css$/i,
          use: ["style-loader", "css-loader", "postcss-loader"],
        },
      ],
    },
    plugins: [
      new webpack.DefinePlugin({
        "process.env.BROWSER": JSON.stringify(chrome ? "chrome" : "firefox"),
      }),
      new CopyWebpackPlugin({
        patterns: [
          {
            from: "icons",
            to: "icons",
          },
          {
            from: "popup.html",
            to: "popup.html",
            transform: (content) =>
              chrome ? rewriteCopy("popup.html", content) : content,
          },
          {
            from: "restore.html",
            to: "restore.html",
            transform: (content) =>
              chrome ? rewriteCopy("restore.html", content) : content,
          },
          {
            from: "settings.html",
            to: "settings.html",
            transform: (content) =>
              chrome ? rewriteCopy("settings.html", content) : content,
          },
          {
            from: "manifest.json",
            to: "manifest.json",
            transform: (content) =>
              chrome ? toChromeManifest(content) : content,
          },
        ],
      }),
      ...(launchBrowser
        ? [
            new WebExtPlugin({
              sourceDir: path.resolve(
                __dirname,
                chrome ? "dist-chrome" : "dist",
              ),
              ...(chrome
                ? {
                    target: "chromium",
                    chromiumBinary:
                      "/Applications/Google Chrome Dev.app/Contents/MacOS/Google Chrome Dev",
                  }
                : {
                    firefox:
                      "/Applications/Firefox Developer Edition.app/Contents/MacOS/firefox",
                  }),
              runLint: false,
              devtools: false,
            }),
          ]
        : []),
    ],
  };
};
