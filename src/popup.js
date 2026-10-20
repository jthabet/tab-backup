import "./main.css";

document.getElementById("backup").addEventListener("click", exportCurrentTabs);

document.getElementById("restore").addEventListener("click", () => {
  browser.runtime.openOptionsPage().catch((err) => console.error(err));
  window.close();
});

renderTabsList();

async function renderTabsList() {
  const list = document.getElementById("tabs-list");
  const tabs = await getCurrentWindowTabs();

  for (const tab of tabs) {
    const item = document.createElement("li");
    item.className = "truncate";
    item.title = tab.title;

    const button = document.createElement("button");
    button.type = "button";
    button.className =
      "max-w-[calc(100%-1.5rem)] cursor-pointer truncate text-left align-bottom hover:text-neutral-500 dark:hover:text-neutral-400";
    button.textContent = tab.title;
    button.addEventListener("click", () => {
      browser.tabs
        .update(tab.id, { active: true })
        .catch((err) => console.error(err));
    });

    item.append(button);
    list.append(item);
  }
}

function getCurrentWindowTabs() {
  return browser.tabs.query({ currentWindow: true });
}

// DD-MM-YYYY_HH-mm in local time, e.g. 19-10-2026_21-27.
function timestamp(date = new Date()) {
  const pad = (n) => String(n).padStart(2, "0");
  return (
    `${pad(date.getDate())}-${pad(date.getMonth() + 1)}-${date.getFullYear()}` +
    `_${pad(date.getHours())}-${pad(date.getMinutes())}`
  );
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

    const filename = `tabs-${timestamp()}.json`;
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
