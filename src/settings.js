import "./main.css";
import { FORMATS, formatFilename } from "./formats.js";
import {
  DEFAULT_SETTINGS,
  getSettings,
  saveSettings,
} from "./settings-store.js";
import {
  getBackupFolderName,
  hasBookmarksPermission,
  renameBackupFolder,
  requestBookmarksPermission,
} from "./bookmark-backups.js";

const destinationInputs = document.querySelectorAll(
  'input[name="destination"]',
);
const keepInput = document.getElementById("keep");
const folderNameInput = document.getElementById("folder-name");
const folderNameError = document.getElementById("folder-name-error");
const formatInputs = document.querySelectorAll('input[name="format"]');
const filenameInput = document.getElementById("filename");
const preview = document.getElementById("filename-preview");
const status = document.getElementById("status");

let statusTimer;
let saveTimer;
let keepTimer;
let folderTimer;

init();

async function init() {
  const settings = await getSettings();
  // A destination that needs bookmarks only counts if access is granted;
  // the user can revoke it in about:addons.
  const destination =
    settings.destination !== "file" && !(await hasBookmarksPermission())
      ? "file"
      : settings.destination;
  for (const input of destinationInputs) {
    input.checked = input.value === destination;
  }
  keepInput.value = settings.keepBookmarkBackups;
  folderNameInput.value = settings.bookmarkFolderName;
  if (destination !== "file") showActualFolderName(settings.bookmarkFolderName);
  for (const input of formatInputs) {
    input.checked = input.value === settings.format;
  }
  filenameInput.value = settings.filenamePattern;
  updatePreview();

  let currentDestination = destination;
  for (const input of destinationInputs) {
    input.addEventListener("change", async () => {
      if (input.value === "file") {
        currentDestination = "file";
        save({ destination: "file" });
        return;
      }
      // Browsers only show the permission prompt for a direct user action,
      // so request it before awaiting anything else.
      let granted = false;
      try {
        granted = await requestBookmarksPermission();
      } catch (err) {
        console.error(err);
      }
      if (granted) {
        currentDestination = input.value;
        save({ destination: input.value });
      } else {
        for (const other of destinationInputs) {
          other.checked = other.value === currentDestination;
        }
        showStatus("Bookmark backups need access to your bookmarks.");
      }
    });
  }

  folderNameInput.addEventListener("input", () => {
    clearTimeout(folderTimer);
    const name = folderNameInput.value.trim();
    if (!name) {
      folderNameError.textContent = "Enter a folder name.";
      folderNameInput.setAttribute("aria-invalid", "true");
      return;
    }
    folderNameError.textContent = "";
    folderNameInput.removeAttribute("aria-invalid");
    folderTimer = setTimeout(async () => {
      await save({ bookmarkFolderName: name });
      // Rename the existing folder too, if bookmark backups are in use.
      if (await hasBookmarksPermission()) {
        await renameBackupFolder(name).catch((err) => console.error(err));
      }
    }, 600);
  });

  keepInput.addEventListener("input", () => {
    const keep = Math.round(Number(keepInput.value));
    if (!Number.isFinite(keep) || keep < 1 || keep > 200) return;
    clearTimeout(keepTimer);
    keepTimer = setTimeout(() => save({ keepBookmarkBackups: keep }), 400);
  });

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

// Shows the backup folder's real name, which differs from the setting if a
// folder of that name already existed or the user renamed it.
async function showActualFolderName(saved) {
  try {
    const actual = await getBackupFolderName();
    if (actual && actual !== saved) {
      folderNameInput.value = actual;
      await saveSettings({ bookmarkFolderName: actual });
    }
  } catch (error) {
    console.error(error);
  }
}

// A backup made while this page is open may rename the folder.
browser.storage.sync.onChanged.addListener((changes) => {
  const name = changes.bookmarkFolderName?.newValue;
  if (name && document.activeElement !== folderNameInput) {
    folderNameInput.value = name;
  }
});

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
