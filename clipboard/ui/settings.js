const { invoke } = window.__TAURI__.core;
const { listen } = window.__TAURI__.event;

const status = document.getElementById("status");
const hotkeyButton = document.getElementById("hotkey");
const fields = [...document.querySelectorAll("[data-key]")];
let settings = {};
let saveTimer = null;

// ------------------------------------------------------------------- hotkey

const KEY_LABELS = {
  Space: "Space", Enter: "↩", Tab: "⇥", Backspace: "⌫", Delete: "⌦",
  ArrowUp: "↑", ArrowDown: "↓", ArrowLeft: "←", ArrowRight: "→",
  Minus: "-", Equal: "=", Comma: ",", Period: ".", Slash: "/", Semicolon: ";",
  Quote: "'", Backquote: "`", BracketLeft: "[", BracketRight: "]", Backslash: "\\",
};
const MODIFIER_LABELS = { Control: "⌃", Alt: "⌥", Shift: "⇧", Command: "⌘" };

function describeHotkey(accelerator) {
  if (!accelerator) return "None";
  const parts = accelerator.split("+");
  const key = parts.pop();
  // Modifiers in the order macOS shows them: ⌃⌥⇧⌘.
  const modifiers = Object.keys(MODIFIER_LABELS).filter((name) => parts.includes(name));
  return modifiers.map((name) => MODIFIER_LABELS[name]).join("") + (KEY_LABELS[key] ?? key);
}

/** Builds an accelerator such as "Command+Shift+C" from a key press, or null. */
function acceleratorFrom(event) {
  let key = null;
  const { code } = event;
  if (/^Key[A-Z]$/.test(code)) key = code.slice(3);
  else if (/^Digit[0-9]$/.test(code)) key = code.slice(5);
  else if (/^F([1-9]|1[0-9])$/.test(code) || code in KEY_LABELS) key = code;
  if (!key || !(event.metaKey || event.ctrlKey || event.altKey)) return null;
  const parts = [];
  if (event.ctrlKey) parts.push("Control");
  if (event.altKey) parts.push("Alt");
  if (event.shiftKey) parts.push("Shift");
  if (event.metaKey) parts.push("Command");
  return [...parts, key].join("+");
}

function stopRecording() {
  hotkeyButton.classList.remove("recording");
  hotkeyButton.textContent = describeHotkey(settings.hotkey);
}

hotkeyButton.addEventListener("click", () => {
  hotkeyButton.classList.add("recording");
  hotkeyButton.textContent = "Press shortcut…";
});

hotkeyButton.addEventListener("blur", stopRecording);

hotkeyButton.addEventListener("keydown", (event) => {
  if (!hotkeyButton.classList.contains("recording")) return;
  event.preventDefault();
  if (event.key === "Escape") return stopRecording();
  const accelerator = acceleratorFrom(event);
  if (!accelerator) return; // still waiting for a non-modifier key with ⌘, ⌃ or ⌥
  settings.hotkey = accelerator;
  stopRecording();
  save();
});

// ------------------------------------------------------------------- fields

function show() {
  for (const field of fields) {
    const value = settings[field.dataset.key];
    if (field.type === "checkbox") field.checked = !!value;
    else if ("list" in field.dataset) field.value = (value ?? []).join("\n");
    else field.value = value;
  }
  hotkeyButton.textContent = describeHotkey(settings.hotkey);

  const paste = settings.pasteByDefault;
  const plain = settings.removeFormattingByDefault;
  const act = (doPaste, doPlain) =>
    doPaste ? (doPlain ? "paste without formatting" : "paste") : doPlain ? "copy as plain text" : "copy";
  document.getElementById("modifier-hint").textContent =
    `Select to ${act(paste, plain)}. Hold ⌥ to ${act(!paste, plain)}; hold ⌥⇧ to ${act(true, !plain)}.`;
}

function collect() {
  for (const field of fields) {
    const key = field.dataset.key;
    if (field.type === "checkbox") settings[key] = field.checked;
    else if ("list" in field.dataset) {
      settings[key] = field.value.split("\n").map((line) => line.trim()).filter(Boolean);
    } else if (field.type === "number") {
      const number = Number(field.value);
      if (Number.isFinite(number) && field.value !== "") {
        settings[key] = field.step ? number : Math.round(number);
      }
    } else settings[key] = field.value;
  }
}

function invalidPattern() {
  for (const pattern of settings.ignoredRegexps ?? []) {
    try {
      new RegExp(pattern);
    } catch {
      return pattern;
    }
  }
  return null;
}

async function save() {
  collect();
  const bad = invalidPattern();
  try {
    await invoke("set_settings", { settings });
    status.textContent = bad ? `"${bad}" may not be a valid regular expression; it is skipped if it fails to compile.` : "";
  } catch (error) {
    status.textContent = String(error);
  }
  // The backend may have clamped a number or refused a shortcut: show what was actually stored.
  settings = await invoke("get_settings");
  show();
  refreshSize();
}

for (const field of fields) {
  const immediate = field.type === "checkbox" || field.tagName === "SELECT";
  field.addEventListener(immediate ? "change" : "input", () => {
    clearTimeout(saveTimer);
    if (immediate) save();
    else saveTimer = setTimeout(saveKeepingFocus, 400);
  });
}

/** Saves without rewriting the field being typed in. */
async function saveKeepingFocus() {
  const active = document.activeElement;
  const text = active?.value;
  const caret = active?.selectionStart;
  await save();
  if (active && text !== undefined && fields.includes(active) && active.type !== "checkbox") {
    active.value = text;
    if (active.tagName === "TEXTAREA" || active.type === "text") active.setSelectionRange(caret, caret);
  }
}

document.getElementById("reset-types").addEventListener("click", async () => {
  const defaults = await invoke("default_ignored_types");
  document.querySelector('[data-key="ignoredPasteboardTypes"]').value = defaults.join("\n");
  save();
});

// --------------------------------------------------------------------- tabs

for (const tab of document.querySelectorAll("#tabs button")) {
  tab.addEventListener("click", () => {
    for (const other of document.querySelectorAll("#tabs button")) {
      other.setAttribute("aria-selected", other === tab);
      document.getElementById(other.dataset.pane).hidden = other !== tab;
    }
    if (tab.dataset.pane === "storage") refreshSize();
  });
}

async function refreshSize() {
  const bytes = await invoke("storage_size");
  const units = ["bytes", "KB", "MB", "GB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1000 && unit < units.length - 1) {
    value /= 1000;
    unit++;
  }
  document.getElementById("storage-size").textContent =
    `${unit === 0 ? value : value.toFixed(1)} ${units[unit]}`;
}

async function load() {
  settings = await invoke("get_settings");
  show();
  refreshSize();
}

// The tray menu can change pause state while this window is open.
listen("settings-changed", async () => {
  if (fields.includes(document.activeElement) && document.activeElement.type !== "checkbox") return;
  settings = await invoke("get_settings");
  show();
});
listen("history-changed", refreshSize);

load();
