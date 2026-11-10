// The demo's clipboard history. It mirrors the app's rules and lives in memory only.

export const PIN_KEYS = 'bdefghijklmnoprstuy'; // same letters the app hands out
export const DEMO_LIMIT = 9;
export const SEED = [
  'git commit --amend --no-edit',
  'https://tokly.blackielabs.com/',
  '#7C5CFF',
  'Thanks, see you on Thursday at ten.',
  'SELECT id, title FROM notes WHERE pinned = 1;',
];

export function displayText(text) {
  return text.replace(/\n/g, '⏎').replace(/\t/g, '⇥');
}

export function hexColor(text) {
  return /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(text.trim()) ? text.trim() : null;
}

/** Splits text into matched and unmatched runs for a case-insensitive query. */
export function segments(text, query) {
  if (!query) return [{text, match: false}];
  const parts = [];
  const haystack = text.toLowerCase();
  const needle = query.toLowerCase();
  let from = 0;
  for (;;) {
    const at = haystack.indexOf(needle, from);
    if (at === -1) break;
    if (at > from) parts.push({text: text.slice(from, at), match: false});
    parts.push({text: text.slice(at, at + needle.length), match: true});
    from = at + needle.length;
  }
  if (from < text.length) parts.push({text: text.slice(from), match: false});
  return parts;
}

export function createHistory(seed = SEED, limit = DEMO_LIMIT) {
  let nextId = 0;
  let items = [];
  const make = (text) => ({id: `item-${nextId++}`, text, pin: null});
  const reset = () => {
    items = seed.map(make);
  };
  reset();

  return {
    reset,
    get(id) {
      return items.find((item) => item.id === id) || null;
    },
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
    remove(id) {
      items = items.filter((item) => item.id !== id);
    },
    togglePin(id) {
      const item = this.get(id);
      if (!item) return null;
      if (item.pin) {
        item.pin = null;
        return null;
      }
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
