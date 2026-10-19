import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { IconFolderDown, IconFolderUp } from "@tabler/icons-react";
import dayjs from "dayjs";

import "./main.css";

const root = createRoot(document.getElementById("root"));
root.render(
  <div className="h-128 w-96 bg-inherit">
    <div className="max-h-full min-h-full max-w-full min-w-full overflow-auto overscroll-auto scroll-auto">
      <Popup />
    </div>
  </div>,
);

function Popup() {
  return (
    <div className="relative">
      <NavBar />
      <div className="border-t border-slate-700 px-3">
        <TabsList />
      </div>
    </div>
  );
}

function NavBar() {
  return (
    <div className="sticky top-0 flex h-2/5 justify-center space-x-3 bg-inherit p-2">
      <button
        type="button"
        className="flex h-12 min-w-28 cursor-pointer items-center justify-center gap-2 rounded-lg border-2 border-blue-600 bg-blue-600 px-4 text-white hover:border-blue-700 hover:bg-blue-700"
        onClick={() => exportCurrentTabs()}
      >
        <IconFolderDown strokeWidth={2} aria-hidden="true" />
        Back up
      </button>

      <button
        type="button"
        className="flex h-12 min-w-28 cursor-pointer items-center justify-center gap-2 rounded-lg border-2 border-blue-600 px-4 text-blue-600 hover:bg-blue-600/10 dark:text-blue-400"
        onClick={() => {
          browser.runtime.openOptionsPage().catch((err) => console.error(err));
          window.close();
        }}
      >
        <IconFolderUp strokeWidth={2} aria-hidden="true" />
        Restore…
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
      className="m-1 mt-5 mb-4 ml-3 w-11/12 list-inside list-disc space-y-3 font-sans font-normal subpixel-antialiased"
      id="tabs-list"
    >
      {tabs.map((tab) => (
        <li key={tab.id} className="truncate" title={tab.title}>
          <button
            type="button"
            className="max-w-[calc(100%-1.5rem)] cursor-pointer truncate text-left align-bottom hover:text-blue-400"
            onClick={() => {
              browser.tabs
                .update(tab.id, { active: true })
                .catch((err) => console.error(err));
            }}
          >
            {tab.title}
          </button>
        </li>
      ))}
    </ol>
  );
}

function getCurrentWindowTabs() {
  return browser.tabs.query({ currentWindow: true });
}

async function exportCurrentTabs() {
  let objURL;
  try {
    const tabs = await getCurrentWindowTabs();
    const list = tabs.map((tab) => ({ title: tab.title, url: tab.url }));
    const blob = new Blob([JSON.stringify(list, null, 2)], {
      type: "application/json",
    });
    objURL = URL.createObjectURL(blob);

    const filename = `tabs-${dayjs().format("DD-MM-YYYY_HH-mm")}.json`;
    const downloadId = await browser.downloads.download({
      url: objURL,
      filename,
    });
    console.log(`downloading ${downloadId}`);

    function handleChanged(delta) {
      if (delta.id !== downloadId || !delta.state) return;
      if (delta.state.current === "complete") {
        browser.downloads.onChanged.removeListener(handleChanged);
        URL.revokeObjectURL(objURL);
        window.close();
      } else if (delta.state.current === "interrupted") {
        browser.downloads.onChanged.removeListener(handleChanged);
        URL.revokeObjectURL(objURL);
      }
    }
    browser.downloads.onChanged.addListener(handleChanged);

    // The download may have finished before the listener was attached.
    const [item] = await browser.downloads.search({ id: downloadId });
    if (item && item.state !== "in_progress") {
      handleChanged({ id: downloadId, state: { current: item.state } });
    }
  } catch (error) {
    if (objURL) URL.revokeObjectURL(objURL);
    console.error(`Download failed ${error}`);
  }
}
