import "./main.css";
import { FORMATS, formatFilename } from "./formats.js";
import {
  DEFAULT_SETTINGS,
  getSettings,
  saveSettings,
} from "./settings-store.js";

const formatInputs = document.querySelectorAll('input[name="format"]');
const filenameInput = document.getElementById("filename");
const preview = document.getElementById("filename-preview");
const status = document.getElementById("status");

let statusTimer;
let saveTimer;

init();

async function init() {
  const settings = await getSettings();
  for (const input of formatInputs) {
    input.checked = input.value === settings.format;
  }
  filenameInput.value = settings.filenamePattern;
  updatePreview();

  for (const input of formatInputs) {
    input.addEventListener("change", () => {
      updatePreview();
      save({ format: input.value });
    });
  }

  // Save shortly after typing stops instead of on every keystroke, to stay
  // well under storage.sync's write limits.
  filenameInput.addEventListener("input", () => {
    updatePreview();
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      save({ filenamePattern: filenameInput.value });
    }, 400);
  });

  document.getElementById("filename-reset").addEventListener("click", () => {
    filenameInput.value = DEFAULT_SETTINGS.filenamePattern;
    updatePreview();
    clearTimeout(saveTimer);
    save({ filenamePattern: filenameInput.value });
  });
}

function selectedFormat() {
  const checked = [...formatInputs].find((input) => input.checked);
  return FORMATS[checked?.value] ?? FORMATS.json;
}

function updatePreview() {
  const name = formatFilename(filenameInput.value, new Date(), 12);
  preview.textContent = `${name}.${selectedFormat().extension}`;
}

async function save(changes) {
  try {
    await saveSettings(changes);
    showStatus("Saved");
  } catch (error) {
    console.error(error);
    showStatus("Couldn't save your settings. Try again.");
  }
}

function showStatus(message) {
  status.textContent = message;
  clearTimeout(statusTimer);
  statusTimer = setTimeout(() => {
    status.textContent = "";
  }, 2000);
}
