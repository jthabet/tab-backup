import { createRoot } from "react-dom/client";
import "./main.css";

const root = createRoot(document.getElementById("root"));
root.render(<ImportAction />);

function ImportAction() {
  return (
    <div className="flex items-center space-x-6">
      <label className="inline-block" htmlFor="input">
        Import tabs from
      </label>
      <input
        className="block h-12 min-w-32 text-sm text-slate-500 file:mr-4 file:rounded-lg file:border-0 file:bg-blue-600 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-sky-100 hover:file:bg-blue-800"
        type="file"
        id="input"
        accept="application/json"
        onChange={(event) => {
          const input = event.target;
          const file = input.files[0];
          if (!file) return;
          file
            .text()
            .then(openImportedTabs)
            .catch((err) => console.error(err))
            // Allow choosing the same file again to re-trigger onChange.
            .finally(() => {
              input.value = "";
            });
        }}
      />
    </div>
  );
}

function openImportedTabs(text) {
  let objects;
  try {
    objects = JSON.parse(text);
  } catch (err) {
    console.error(`Invalid backup file: ${err}`);
    return;
  }
  if (!Array.isArray(objects)) {
    console.error("Invalid backup file: expected an array of {title, url}");
    return;
  }

  const entries = objects.filter(
    (object) => object && typeof object.url === "string" && object.url,
  );
  console.log(`found ${entries.length} tabs`);

  for (const { url } of entries) {
    browser.tabs
      .create({ url, active: false })
      .then((tab) => console.info(`Created new tab: ${tab.title}`))
      .catch((error) => console.error(`Error opening ${url}: ${error}`));
  }
}
