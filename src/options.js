import { createRoot } from "react-dom/client";

import "./main.css";

function ImportAction() {
  return (
    <div className="flex items-center space-x-6">
      <label className="inline-block">Import tabs from</label>

      <input
        className="block w-full text-sm text-slate-500 file:mr-4 file:rounded-full file:border-0 file:bg-sky-500 file:py-2 file:px-4 file:text-sm file:font-semibold file:text-sky-100 hover:file:bg-sky-100 hover:file:text-sky-600"
        type="file"
        id="input"
        accept="application/json"
        onChange={(event) => {
          const files = event.target.files;

          const reader = new FileReader();
          reader.onload = (e) => {
            openImportedTabs(e.target.result);
          };
          reader.readAsText(files[0]);
        }}
      />
    </div>
  );
}

function openImportedTabs(text) {
  let objects;

  function onCreated(tab) {
    console.info(`Created new tab: ${tab.title}`);
  }

  function onError(error) {
    console.error(`Error: ${error}`);
  }

  try {
    objects = JSON.parse(text);

    console.log(`found ${objects.length} tabs`);

    objects.forEach(function (object) {
      let creating = browser.tabs.create({
        url: object.url,
        active: false,
      });
      creating.then(onCreated, onError);
    });
  } catch (err) {
    console.error(err);
  }
}

const root = createRoot(document.getElementById("root"));
root.render(<ImportAction />);
