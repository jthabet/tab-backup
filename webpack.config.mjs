import path from "path";
import { fileURLToPath } from "url";
import webpack from "webpack";
import CopyWebpackPlugin from "copy-webpack-plugin";
import WebExtPlugin from "web-ext-plugin";
import { resolveMessages } from "./scripts/locales.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
          },
          {
            from: "restore.html",
            to: "restore.html",
          },
          {
            from: "settings.html",
            to: "settings.html",
          },
          {
            // Keeps each message's wording for this browser (key__firefox,
            // key__chrome); see scripts/locales.mjs.
            from: "_locales/*/messages.json",
            transform: (content) =>
              JSON.stringify(
                resolveMessages(
                  JSON.parse(content.toString()),
                  chrome ? "chrome" : "firefox",
                ),
              ),
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
