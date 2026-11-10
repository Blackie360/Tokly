'use strict';

// Demo of the Tokly popup. Everything lives in memory on this page; the script
// never reads the clipboard and only writes to it when "Copy command" is pressed.

const PIN_KEYS = 'bdefghijklmnoprstuy'; // same letters the app hands out
const DEMO_LIMIT = 9;
const SEED = [
  'git commit --amend --no-edit',
  'https://tokly.blackielabs.com/',
  '#7C5CFF',
  'Thanks, see you on Thursday at ten.',
  'SELECT id, title FROM notes WHERE pinned = 1;',
];

function displayText(text) {
  return text.replace(/\n/g, '⏎').replace(/\t/g, '⇥');
}

function hexColor(text) {
  return /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(text.trim()) ? text.trim() : null;
}

// Splits text into matched and unmatched runs for a case-insensitive query.
function segments(text, query) {
  if (!query) return [{ text, match: false }];
  const parts = [];
  const haystack = text.toLowerCase();
  const needle = query.toLowerCase();
  let from = 0;
  for (;;) {
    const at = haystack.indexOf(needle, from);
    if (at === -1) break;
    if (at > from) parts.push({ text: text.slice(from, at), match: false });
    parts.push({ text: text.slice(at, at + needle.length), match: true });
    from = at + needle.length;
  }
  if (from < text.length) parts.push({ text: text.slice(from), match: false });
  return parts;
}

function createHistory(seed, limit = DEMO_LIMIT) {
  let nextId = 0;
  let items = [];
  const make = (text) => ({ id: `item-${nextId++}`, text, pin: null });
  const reset = () => { items = seed.map(make); };
  reset();

  return {
    reset,
    get(id) { return items.find((item) => item.id === id) || null; },
    // Copying something already in the history moves it to the top.
    add(text) {
      if (!text) return null;
      let item = items.find((candidate) => candidate.text === text);
      if (item) items = items.filter((candidate) => candidate !== item);
      else item = make(text);
      items.unshift(item);
      const unpinned = items.filter((candidate) => candidate.pin === null);
      for (const extra of unpinned.slice(limit)) items = items.filter((candidate) => candidate !== extra);
      return item.id;
    },
    remove(id) { items = items.filter((item) => item.id !== id); },
    togglePin(id) {
      const item = this.get(id);
      if (!item) return null;
      if (item.pin) { item.pin = null; return null; }
      const used = new Set(items.map((candidate) => candidate.pin));
      const free = [...PIN_KEYS].find((letter) => !used.has(letter));
      item.pin = free || null;
      return item.pin;
    },
    // Pinned items first, by letter, then the rest from newest to oldest.
    list(query = '') {
      const needle = query.trim().toLowerCase();
      const matches = items.filter((item) => displayText(item.text).toLowerCase().includes(needle));
      const pinned = matches.filter((item) => item.pin).sort((a, b) => a.pin.localeCompare(b.pin));
      const rest = matches.filter((item) => !item.pin);
      return [...pinned, ...rest];
    },
  };
}

function initDemo() {
  const search = document.getElementById('demo-search');
  const list = document.getElementById('demo-list');
  const empty = document.getElementById('demo-empty');
  const status = document.getElementById('demo-status');
  const pinButton = document.getElementById('demo-pin');
  const deleteButton = document.getElementById('demo-delete');
  const resetButton = document.getElementById('demo-reset');
  if (!search || !list) return;

  const history = createHistory(SEED);
  let rows = [];
  let selectedId = null;

  const say = (message) => { status.textContent = message; };
  const short = (text) => {
    const shown = displayText(text);
    return shown.length > 32 ? `${shown.slice(0, 31)}…` : shown;
  };

  function render() {
    const query = search.value.trim();
    rows = history.list(query);
    if (!rows.some((row) => row.id === selectedId)) selectedId = rows[0] ? rows[0].id : null;
    list.textContent = '';
    let unpinnedSeen = 0;
    let previousPinned = null;

    for (const row of rows) {
      const pinned = row.pin !== null;
      if (previousPinned === true && !pinned) {
        const divider = document.createElement('li');
        divider.className = 'divider';
        divider.setAttribute('role', 'separator');
        list.append(divider);
      }
      previousPinned = pinned;

      const item = document.createElement('li');
      item.id = `opt-${row.id}`;
      item.dataset.id = row.id;
      item.setAttribute('role', 'option');
      item.setAttribute('aria-selected', String(row.id === selectedId));
      item.classList.toggle('selected', row.id === selectedId);

      const color = hexColor(row.text);
      if (color) {
        const swatch = document.createElement('span');
        swatch.className = 'swatch';
        swatch.style.background = color;
        item.append(swatch);
      }

      const title = document.createElement('span');
      title.className = 'title';
      for (const part of segments(displayText(row.text), query)) {
        if (part.match) {
          const mark = document.createElement('strong');
          mark.textContent = part.text;
          title.append(mark);
        } else {
          title.append(part.text);
        }
      }
      item.append(title);

      const hint = document.createElement('kbd');
      if (pinned) hint.textContent = `⌘${row.pin.toUpperCase()}`;
      else if (++unpinnedSeen <= 9) hint.textContent = `⌘${unpinnedSeen}`;
      item.append(hint);
      list.append(item);
    }

    const none = rows.length === 0;
    list.hidden = none;
    empty.hidden = !none;
    empty.textContent = query ? 'No matches' : 'Nothing copied yet. Copy something and it will show up here.';
    if (selectedId) search.setAttribute('aria-activedescendant', `opt-${selectedId}`);
    else search.removeAttribute('aria-activedescendant');
    const selected = history.get(selectedId);
    pinButton.disabled = deleteButton.disabled = !selected;
    pinButton.firstChild.textContent = selected && selected.pin ? 'Unpin ' : 'Pin ';
    const active = selectedId && document.getElementById(`opt-${selectedId}`);
    if (active && active.scrollIntoView) active.scrollIntoView({ block: 'nearest' });
  }

  function move(step) {
    if (!rows.length) return;
    const index = rows.findIndex((row) => row.id === selectedId);
    selectedId = rows[Math.min(rows.length - 1, Math.max(0, index + step))].id;
    render();
  }

  function choose(id) {
    const item = history.get(id);
    if (!item) return;
    history.add(item.text);
    selectedId = item.id;
    search.value = '';
    render();
    say(`Copied “${short(item.text)}” inside the demo. Your real clipboard was not touched.`);
  }

  function togglePin() {
    const item = history.get(selectedId);
    if (!item) return;
    const letter = history.togglePin(item.id);
    render();
    say(letter ? `Pinned. In the app, ⌘${letter.toUpperCase()} picks it.` : 'Unpinned.');
  }

  function removeSelected() {
    const item = history.get(selectedId);
    if (!item) return;
    const index = rows.findIndex((row) => row.id === item.id);
    history.remove(item.id);
    const neighbour = rows[index + 1] || rows[index - 1];
    selectedId = neighbour ? neighbour.id : null;
    render();
    say(`Deleted “${short(item.text)}” from the demo history.`);
  }

  search.addEventListener('input', render);
  search.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowDown') { event.preventDefault(); move(1); }
    else if (event.key === 'ArrowUp') { event.preventDefault(); move(-1); }
    else if (event.key === 'Enter') { event.preventDefault(); choose(selectedId); }
    else if (event.altKey && event.code === 'KeyP') { event.preventDefault(); togglePin(); }
    else if (event.altKey && event.key === 'Backspace') { event.preventDefault(); removeSelected(); }
    else if (event.key === 'Escape' && search.value) { event.preventDefault(); search.value = ''; render(); }
  });

  list.addEventListener('click', (event) => {
    const item = event.target.closest('li[data-id]');
    if (item) choose(item.dataset.id);
  });

  pinButton.addEventListener('click', togglePin);
  deleteButton.addEventListener('click', removeSelected);
  resetButton.addEventListener('click', () => {
    history.reset();
    selectedId = null;
    search.value = '';
    render();
    say('Demo history reset.');
  });

  for (const button of document.querySelectorAll('[data-copy]')) {
    button.disabled = false;
    button.addEventListener('click', () => {
      const text = button.dataset.copy;
      selectedId = history.add(text);
      search.value = '';
      render();
      say(`Added “${short(text)}” to the demo history.`);
    });
  }

  search.disabled = false;
  resetButton.disabled = false;
  render();
}

function initInstall() {
  const button = document.getElementById('brew-copy');
  const command = document.getElementById('brew-command');
  const status = document.getElementById('brew-status');
  if (!button || !command) return;
  button.disabled = false;
  button.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(command.textContent);
      status.textContent = 'Command copied to your clipboard.';
    } catch {
      const range = document.createRange();
      range.selectNodeContents(command);
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      status.textContent = 'Command selected. Press ⌘C to copy it.';
    }
  });
}

if (typeof document !== 'undefined') {
  initDemo();
  initInstall();
}
