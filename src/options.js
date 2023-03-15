import "./main.css";

const fileInput = document.getElementById("input");

fileInput.addEventListener("change", (event) => {
  const files = event.target.files;

  const reader = new FileReader();
  reader.onload = (e) => {
    openImportedTabs(e.target.result);
  };
  reader.readAsText(files[0]);
});

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

function retrieveCurrentExtStorage() {
  browser.storage.sync
    .getBytesInUse()
    .then((res) => console.log("current storage is " + res));
}
