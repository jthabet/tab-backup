import path from "path";
import { fileURLToPath } from "url";
import CopyWebpackPlugin from "copy-webpack-plugin";
import WebExtPlugin from "web-ext-plugin";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default {
  mode: "production",
  context: path.resolve(__dirname, "src"),
  entry: {
    background: "./background.js",
    popup: "./popup.js",
    options: "./options.js",
  },
  output: {
    path: path.resolve(__dirname, "dist"),
    filename: "[name].js",
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
          from: "options.html",
          to: "options.html",
        },
        {
          from: "manifest.json",
          to: "manifest.json",
        },
      ],
    }),
    new WebExtPlugin({
      sourceDir: path.resolve(__dirname, "dist"),
      firefox:
        "/Applications/Firefox Developer Edition.app/Contents/MacOS/firefox",
      runLint: false,
      devtools: false,
    }),
  ],
};
