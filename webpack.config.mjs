import path from "path";
import { fileURLToPath } from "url";
import CopyWebpackPlugin from "copy-webpack-plugin";
import WebExtPlugin from "web-ext-plugin";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default (env = {}) => {
  const launchFirefox = env.launchFirefox !== "false";

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
      path: path.resolve(__dirname, "dist"),
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
            from: "manifest.json",
            to: "manifest.json",
          },
        ],
      }),
      ...(launchFirefox
        ? [
            new WebExtPlugin({
              sourceDir: path.resolve(__dirname, "dist"),
              firefox:
                "/Applications/Firefox Developer Edition.app/Contents/MacOS/firefox",
              runLint: false,
              devtools: false,
            }),
          ]
        : []),
    ],
  };
};
