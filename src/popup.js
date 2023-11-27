import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import dayjs from "dayjs";

import "./main.css";

function Popup() {
  return (
    <div className="relative m-1 bg-inherit">
      <NavBar />

      <div className="mt-3 border-t border-slate-700 px-3 ">
        <TabsList />
      </div>
    </div>
  );
}

function NavBar() {
  return (
    <div className="sticky top-0 flex h-2/5 justify-center space-x-3 bg-inherit pt-2 dark:bg-slate-900 ">
      <button
        className="rounded-full p-2.5 text-center hover:bg-slate-700"
        onClick={() => exportCurrentTabs()}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="icon icon-tabler icon-tabler-device-floppy pointer-events-none"
          width="24"
          height="24"
          viewBox="0 0 24 24"
          strokeWidth="1"
          stroke="currentColor"
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path stroke="none" d="M0 0h24v24H0z" fill="none"></path>
          <path d="M6 4h10l4 4v10a2 2 0 0 1 -2 2h-12a2 2 0 0 1 -2 -2v-12a2 2 0 0 1 2 -2"></path>
          <path d="M12 14m-2 0a2 2 0 1 0 4 0a2 2 0 1 0 -4 0"></path>
          <path d="M14 4l0 4l-6 0l0 -4"></path>
        </svg>
      </button>

      <button
        className="rounded-full p-2.5 text-center hover:bg-slate-700"
        onClick={() => {
          browser.runtime.openOptionsPage().catch((err) => console.error(err));
          window.close();
        }}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="icon icon-tabler icon-tabler-file-arrow-left pointer-events-none"
          width="24"
          height="24"
          viewBox="0 0 24 24"
          strokeWidth="1"
          stroke="currentColor"
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path stroke="none" d="M0 0h24v24H0z" fill="none"></path>
          <path d="M14 3v4a1 1 0 0 0 1 1h4"></path>
          <path d="M17 21h-10a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2h7l5 5v11a2 2 0 0 1 -2 2z"></path>
          <path d="M15 15h-6"></path>
          <path d="M11.5 17.5l-2.5 -2.5l2.5 -2.5"></path>
        </svg>
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
      className="m-1 mb-4 mt-5 w-11/12 list-inside list-disc space-y-3 truncate italic subpixel-antialiased"
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
          <li>{tab.title}</li>
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

const root = createRoot(document.getElementById("root"));
root.render(
  <div className="h-128 w-96 ">
    <div className="max-h-full min-h-full min-w-full max-w-full place-items-center overflow-auto overscroll-auto scroll-auto font-sans font-normal  antialiased">
      <Popup />
    </div>
  </div>,
);
