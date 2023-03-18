import "./main.css";

function listTabs() {
  getCurrentWindowTabs().then((tabs) => {
    const tabsList = document.getElementById("tabs-list");
    const currentTabs = document.createDocumentFragment();
    const limit = 25;
    let counter = 0;

    tabsList.textContent = "";

    for (let tab of tabs) {
      if (counter <= limit) {
        const li = document.createElement("li");

        li.textContent = tab.title || tab.id;
        li.classList.add("block");
        li.classList.add("dark:text-white");

        currentTabs.appendChild(li);
      }

      counter += 1;
    }

    tabsList.appendChild(currentTabs);
  });
}

document.addEventListener("DOMContentLoaded", listTabs);

function getCurrentWindowTabs() {
  return browser.tabs.query({ currentWindow: true });
}

function printCurrentTabs() {
  const list = new Array();

  getCurrentWindowTabs()
    .then((tabs) => {
      for (let tab of tabs) {
        list.push({ title: tab.title, url: tab.url });
      }
    })
    .finally(() => {
      console.info(JSON.stringify(list, null, 2));
    });
}

function exportCurrentTabs() {
  const list = new Array();

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
        }
      });

      let downloading = browser.downloads.download({
        url: objURL,
        filename: "tabs.json",
      });

      downloading
        .then((id) => console.log(`downloading ${id}`))
        .catch((error) => console.error(`Download failed ${error}`));
    });
}

document.addEventListener("click", (e) => {
  if (e.target.id === "tabs-print") {
    printCurrentTabs();
  } else if (e.target.id === "tabs-export") {
    exportCurrentTabs();
  } else if (e.target.id === "tabs-import") {
    browser.runtime.openOptionsPage();
  } else if (e.target.id === "option-menu") {
    browser.runtime.openOptionsPage();
  }

  e.preventDefault();
});
