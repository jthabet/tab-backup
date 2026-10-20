import "./main.css";

document.getElementById("input").addEventListener("change", (event) => {
  const input = event.target;
  const file = input.files[0];
  if (!file) return;
  file
    .text()
    .then(openImportedTabs)
    .catch((err) => console.error(err))
    // Allow choosing the same file again to re-trigger the change event.
    .finally(() => {
      input.value = "";
    });
});

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
