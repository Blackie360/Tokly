const { invoke } = window.__TAURI__.core;
const { listen } = window.__TAURI__.event;

const el = {
  panel: document.getElementById("panel"),
  searchBar: document.getElementById("search-bar"),
  search: document.getElementById("search"),
  searchClear: document.getElementById("search-clear"),
  list: document.getElementById("list"),
  empty: document.getElementById("empty"),
  info: document.getElementById("info"),
  confirm: document.getElementById("confirm"),
  confirmOk: document.getElementById("confirm-ok"),
  confirmCancel: document.getElementById("confirm-cancel"),
  confirmSuppress: document.getElementById("confirm-suppress"),
  footer: document.getElementById("footer"),
};

let settings = {};
let rows = [];
let selectedId = null;
let pendingClearAll = false;
let request = 0;
const thumbnails = new Map();

// ------------------------------------------------------------------ helpers

const escapeHtml = (text) =>
  text.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

/** One-line version of a title, optionally making whitespace visible. */
function displayTitle(title) {
  if (!settings.showSpecialSymbols) return title.trim().replace(/\s+/g, " ");
  const lead = title.match(/^ */)[0].length;
  const trail = title.length > lead ? title.match(/ *$/)[0].length : 0;
  const middle = title.slice(lead, title.length - trail);
  return "·".repeat(lead) + middle.replace(/\r?\n/g, "⏎").replace(/\t/g, "⇥") + "·".repeat(trail);
}

/** Character ranges [start, end) of `text` to highlight for the current query. */
function matchRanges(text, query, mode) {
  if (!query) return [];
  const lower = text.toLowerCase();
  const needle = query.toLowerCase();
  if (mode === "exact" || mode === "mixed") {
    const at = lower.indexOf(needle);
    if (at >= 0) return [[at, at + needle.length]];
  }
  if (mode === "regexp" || mode === "mixed") {
    try {
      const found = new RegExp(query, "i").exec(text);
      if (found && found[0].length) return [[found.index, found.index + found[0].length]];
    } catch {
      /* not a valid pattern in JS: nothing to highlight */
    }
  }
  if (mode === "fuzzy" || mode === "mixed") {
    const ranges = [];
    let n = 0;
    for (let i = 0; i < lower.length && n < needle.length; i++) {
      if (lower[i] === needle[n]) {
        ranges.push([i, i + 1]);
        n++;
      }
    }
    if (n === needle.length) return ranges;
  }
  return [];
}

function highlighted(text, query) {
  const ranges = matchRanges(text, query, settings.searchMode);
  if (!ranges.length) return escapeHtml(text);
  let html = "";
  let at = 0;
  for (const [start, end] of ranges) {
    html += escapeHtml(text.slice(at, start));
    html += `<span class="match ${settings.highlightMatch}">${escapeHtml(text.slice(start, end))}</span>`;
    at = end;
  }
  return html + escapeHtml(text.slice(at));
}

function hexColor(title) {
  const found = /^#?([0-9a-f]{6}|[0-9a-f]{3})$/i.exec(title.trim());
  return found ? `#${found[1]}` : null;
}

const timeFormat = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });

// ---------------------------------------------------------------- rendering

async function refresh() {
  const mine = ++request;
  const found = await invoke("list_items", { query: el.search.value });
  if (mine !== request) return;
  rows = found;
  if (!rows.some((row) => row.id === selectedId)) selectedId = rows[0]?.id ?? null;
  render();
}

function render() {
  const query = el.search.value;
  el.list.textContent = "";
  let unpinnedSeen = 0;
  let previousPinned = null;

  for (const row of rows) {
    const pinned = row.pin !== null;
    if (previousPinned !== null && previousPinned !== pinned) {
      const divider = document.createElement("li");
      divider.className = "divider";
      divider.setAttribute("role", "separator");
      el.list.append(divider);
    }
    previousPinned = pinned;

    const item = document.createElement("li");
    item.dataset.id = row.id;
    item.setAttribute("role", "option");
    item.classList.toggle("selected", row.id === selectedId);
    item.setAttribute("aria-selected", row.id === selectedId);

    const title = document.createElement("span");
    title.className = "title";
    if (row.kind === "image") {
      const label = row.width ? `Image, ${row.width}×${row.height}` : "Image";
      title.textContent = label;
      if (row.hasThumbnail) loadThumbnail(row.id, title, label);
    } else {
      const text = displayTitle(row.title);
      title.innerHTML = highlighted(text, query);
      title.title = row.title.slice(0, 600);
      const color = settings.showHexColorSwatch && hexColor(row.title);
      if (color) {
        const swatch = document.createElement("span");
        swatch.className = "swatch";
        swatch.style.background = color;
        item.append(swatch);
      }
    }
    item.append(title);

    const hint = document.createElement("kbd");
    if (pinned) hint.textContent = keys(`⌘${row.pin.toUpperCase()}`);
    else if (++unpinnedSeen <= 9) hint.textContent = keys(`⌘${unpinnedSeen}`);
    item.append(hint);
    el.list.append(item);
  }

  const none = rows.length === 0;
  el.list.hidden = none;
  el.empty.hidden = !none;
  el.empty.textContent = query ? "No matches" : "Nothing copied yet. Copy something and it will show up here.";
  el.searchClear.hidden = !query;
  el.searchBar.style.display = settings.showSearch === false && !query ? "none" : "";
  el.footer.hidden = settings.showFooter === false;
  renderInfo();
}

async function loadThumbnail(id, holder, label) {
  let source = thumbnails.get(id);
  if (source === undefined) {
    source = await invoke("thumbnail", { id });
    thumbnails.set(id, source);
  }
  // The holder may not be in the list yet (cached thumbnails resolve immediately); filling it is still right.
  if (!source) return;
  const image = document.createElement("img");
  image.src = source;
  image.alt = label;
  image.style.maxHeight = `${settings.imageMaxHeight || 40}px`;
  holder.textContent = "";
  holder.append(image);
}

function renderInfo() {
  const row = rows.find((candidate) => candidate.id === selectedId);
  el.info.hidden = !row;
  if (!row) return;
  const parts = [];
  if (row.application) parts.push(row.application);
  parts.push(row.numberOfCopies === 1 ? "copied once" : `copied ${row.numberOfCopies} times`);
  parts.push(`last ${timeFormat.format(new Date(row.lastCopiedAt * 1000))}`);
  if (row.pin) parts.push("pinned");
  el.info.textContent = parts.join("  ·  ");
}

function select(id, scroll) {
  if (id === selectedId || id == null) return;
  selectedId = id;
  for (const item of el.list.children) {
    const on = item.dataset.id === id;
    item.classList.toggle("selected", on);
    if (item.dataset.id) item.setAttribute("aria-selected", on);
    if (on && scroll) item.scrollIntoView({ block: "nearest" });
  }
  renderInfo();
}

function move(step) {
  if (!rows.length) return;
  const at = rows.findIndex((row) => row.id === selectedId);
  const next = Math.min(rows.length - 1, Math.max(0, at + step));
  select(rows[next].id, true);
}

// ------------------------------------------------------------------ actions

function activate(id, event) {
  if (!id) return;
  let paste = !!settings.pasteByDefault;
  let plain = !!settings.removeFormattingByDefault;
  if (event.altKey && event.shiftKey) {
    paste = true;
    plain = !plain;
  } else if (event.altKey) {
    paste = !paste;
  }
  invoke("select_item", { id, paste, plain });
}

function neighbourOf(id) {
  const at = rows.findIndex((row) => row.id === id);
  return (rows[at + 1] ?? rows[at - 1])?.id ?? null;
}

async function removeSelected() {
  if (!selectedId) return;
  const doomed = selectedId;
  selectedId = neighbourOf(doomed);
  thumbnails.delete(doomed);
  await invoke("delete_item", { id: doomed });
}

function requestClear(all) {
  if (settings.suppressClearAlert) {
    invoke("clear_history", { all });
    return;
  }
  pendingClearAll = all;
  el.confirmOk.textContent = all ? "Clear all" : "Clear";
  el.confirmSuppress.checked = false;
  el.confirm.hidden = false;
  el.confirmOk.focus();
}

function closeConfirm() {
  el.confirm.hidden = true;
  el.search.focus();
}

async function confirmClear() {
  if (el.confirmSuppress.checked) {
    settings.suppressClearAlert = true;
    await invoke("set_settings", { settings }).catch(() => {});
  }
  closeConfirm();
  invoke("clear_history", { all: pendingClearAll });
}

// ------------------------------------------------------------------- events

document.addEventListener("keydown", (event) => {
  const { key, code } = event;
  // The main modifier is ⌘ on macOS and Ctrl elsewhere. AltGr reports itself as Ctrl+Alt
  // on Windows and must not count; Ctrl+N and Ctrl+P move the selection only on macOS.
  const command = IS_MAC ? event.metaKey : event.ctrlKey && !event.getModifierState("AltGraph");
  const control = IS_MAC && event.ctrlKey;

  if (!el.confirm.hidden) {
    if (key === "Escape") {
      event.preventDefault();
      closeConfirm();
    } else if (key === "Enter" && document.activeElement !== el.confirmCancel) {
      event.preventDefault();
      confirmClear();
    }
    return;
  }

  let handled = true;
  if (key === "Escape") {
    if (el.search.value) {
      el.search.value = "";
      refresh();
    } else {
      invoke("hide_popup");
    }
  } else if (key === "ArrowDown" || (control && code === "KeyN")) {
    move(command ? rows.length : 1);
  } else if (key === "ArrowUp" || (control && code === "KeyP")) {
    move(command ? -rows.length : -1);
  } else if (key === "Enter") {
    activate(selectedId, event);
  } else if (command && event.altKey && key === "Backspace") {
    requestClear(event.shiftKey);
  } else if (event.altKey && !command && key === "Backspace") {
    removeSelected();
  } else if (event.altKey && !command && !control && code === "KeyP") {
    if (selectedId) invoke("toggle_pin", { id: selectedId });
  } else if (command && key === ",") {
    invoke("open_settings");
  } else if (command && code === "KeyQ") {
    invoke("quit");
  } else if (command && !control && /^Digit[1-9]$/.test(code)) {
    const row = rows.filter((candidate) => candidate.pin === null)[Number(code.slice(5)) - 1];
    if (row) activate(row.id, event);
  } else if (command && !control && /^Key[A-Z]$/.test(code)) {
    const row = rows.find((candidate) => candidate.pin === code.slice(3).toLowerCase());
    if (row) activate(row.id, event);
    else handled = false; // leave ⌘A, ⌘C, ⌘V, ⌘X, ⌘Z to the search field
  } else {
    handled = false;
  }

  if (handled) event.preventDefault();
  else if (document.activeElement !== el.search) el.search.focus();
});

el.search.addEventListener("input", () => {
  selectedId = null;
  refresh().then(() => (el.list.scrollTop = 0));
});

el.searchClear.addEventListener("click", () => {
  el.search.value = "";
  el.search.focus();
  refresh();
});

el.list.addEventListener("mousemove", (event) => {
  const item = event.target.closest("li[data-id]");
  if (item) select(item.dataset.id, false);
});

el.list.addEventListener("click", (event) => {
  const item = event.target.closest("li[data-id]");
  if (item) activate(item.dataset.id, event);
});

el.footer.addEventListener("click", (event) => {
  const action = event.target.closest("button")?.dataset.action;
  if (action === "clear") requestClear(event.shiftKey);
  else if (action === "preferences") invoke("open_settings");
  else if (action === "quit") invoke("quit");
});

el.confirmOk.addEventListener("click", confirmClear);
el.confirmCancel.addEventListener("click", closeConfirm);

async function loadSettings() {
  settings = await invoke("get_settings");
}

listen("history-changed", refresh);
listen("settings-changed", async () => {
  await loadSettings();
  refresh();
});
listen("popup-shown", async () => {
  await loadSettings();
  el.confirm.hidden = true;
  el.search.value = "";
  selectedId = null;
  await refresh();
  el.list.scrollTop = 0;
  el.search.focus();
});

loadSettings().then(refresh);
