import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { IconFileDownload, IconFileUpload } from "@tabler/icons-react";
import dayjs from "dayjs";

import "./main.css";

const root = createRoot(document.getElementById("root"));
root.render(
  <div className="h-128 w-96 bg-inherit">
    <div className="max-h-full min-h-full min-w-full max-w-full place-items-center overflow-auto overscroll-auto scroll-auto">
      <Popup />
    </div>
  </div>,
);

function Popup() {
  return (
    <div className="relative ">
      <NavBar />

      <div className="border-t border-slate-700 px-3">
        <TabsList />
      </div>
    </div>
  );
}

function NavBar() {
  return (
    <div className="sticky top-0 flex h-2/5 justify-center space-x-3 bg-inherit p-2  dark:bg-slate-900">
      <button
        className="rounded-full p-2.5 text-center hover:bg-slate-700"
        onClick={() => exportCurrentTabs()}
      >
        <IconFileDownload strokeWidth={1} />
      </button>

      <button
        className="rounded-full p-2.5 text-center hover:bg-slate-700"
        onClick={() => {
          browser.runtime.openOptionsPage().catch((err) => console.error(err));
          window.close();
        }}
      >
        <IconFileUpload strokeWidth={1} />
      </button>
    </div>
  );
}

function TabsList() {
  const [tabs, setTabs] = useState([]);

  useEffect(() => {
    getCurrentWindowTabs().then((tabs) => {
      setTabs(tabs);
    });
  }, []);

  return (
    <ol
      className="m-1 mb-4 ml-3 mt-5 w-11/12 list-inside list-disc space-y-3 font-sans font-normal italic subpixel-antialiased"
      id="tabs-list"
    >
      {tabs.map((tab) => (
        <a
          className="hover:not-italic hover:text-blue-400"
          key={tab.id}
          href="#"
          onClick={(e) => {
            e.preventDefault();
            browser.tabs
              .update(tab.id, { active: true })
              .catch((err) => console.error(err));
          }}
        >
          <li className="truncate" title={tab.title}>
            {tab.title}
          </li>
        </a>
      ))}
    </ol>
  );
}

function getCurrentWindowTabs() {
  return browser.tabs.query({ currentWindow: true });
}

function exportCurrentTabs() {
  const list = [];

  function handleChanged(delta) {
    if (delta.state && delta.state.current === "complete") {
      console.log(`Download ${delta.id} has completed.`);
    }
  }

  browser.downloads.onChanged.addListener(handleChanged);

  getCurrentWindowTabs()
    .then((tabs) => {
      for (let tab of tabs) {
        list.push({ title: tab.title, url: tab.url });
      }
    })
    .finally(() => {
      const blob = new Blob([JSON.stringify(list, null, 2)], {
        type: "application/json",
      });

      let objURL = URL.createObjectURL(blob);

      // Listen for the downloads.onChanged event
      browser.downloads.onChanged.addListener(function (downloadDelta) {
        // Check if the download is complete
        if (downloadDelta.state && downloadDelta.state.current === "complete") {
          // Revoke the object URL
          URL.revokeObjectURL(objURL);
          window.close();
        }
      });

      const str1 = "tabs";
      const str2 = dayjs().format("DD-MM-YYYY_HH-mm");

      let downloading = browser.downloads.download({
        url: objURL,
        filename: str1.concat("-", str2) + ".json",
      });

      downloading
        .then((id) => console.log(`downloading ${id}`))
        .catch((error) => console.error(`Download failed ${error}`));
    });
}
