import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// Checks the demo's history logic by running the shipped script with no DOM.
// Rendering, keyboard handling and layout are checked in a browser (see QA.md).
const script = readFileSync(new URL('public/script.js', import.meta.url), 'utf8');
const context = vm.createContext({});
vm.runInContext(script, context);
const { createHistory, segments, hexColor, displayText } = context;
// Array.from keeps results in this realm so deepEqual compares like with like.
const texts = (history, query) => Array.from(history.list(query), (item) => item.text);
const plain = (value) => JSON.parse(JSON.stringify(value));

// New copies go to the top; a repeated copy moves the existing item instead of duplicating it.
let history = createHistory(['a', 'b', 'c']);
assert.deepEqual(texts(history), ['a', 'b', 'c']);
history.add('d');
assert.deepEqual(texts(history), ['d', 'a', 'b', 'c']);
const before = history.list()[2].id;
assert.equal(history.add('b'), before, 'a repeated copy keeps its identity');
assert.deepEqual(texts(history), ['b', 'd', 'a', 'c']);
assert.equal(history.add(''), null, 'empty copies are ignored');

// Pins take the first free letter, sort first, and survive the size limit.
history = createHistory(['one', 'two', 'three'], 3);
const two = history.list()[1].id;
assert.equal(history.togglePin(two), 'b');
assert.deepEqual(texts(history), ['two', 'one', 'three']);
const three = history.list()[2].id;
assert.equal(history.togglePin(three), 'd');
history.add('four');
history.add('five');
history.add('six');
assert.deepEqual(texts(history), ['two', 'three', 'six', 'five', 'four'], 'oldest unpinned item is dropped');
assert.equal(history.togglePin(two), null, 'toggling again unpins');
assert.equal(history.get(two).pin, null);
assert.equal(history.togglePin(two), 'b', 'a released letter is reused');

// Delete and reset.
history.remove(two);
assert.equal(history.get(two), null);
history.reset();
assert.deepEqual(texts(history), ['one', 'two', 'three']);
assert.equal(history.list().every((item) => item.pin === null), true);

// Search is a case-insensitive substring match on what the row displays.
history = createHistory(['Git Commit', 'line one\nline two', '#E8683A']);
assert.deepEqual(texts(history, 'commit'), ['Git Commit']);
assert.deepEqual(texts(history, '⏎'), ['line one\nline two']);
assert.deepEqual(texts(history, 'zzz'), []);
assert.deepEqual(texts(history, '  '), texts(history), 'blank queries match everything');

// Helpers.
assert.equal(displayText('a\nb\tc'), 'a⏎b⇥c');
assert.equal(hexColor('#E8683A'), '#E8683A');
assert.equal(hexColor('#fff'), '#fff');
assert.equal(hexColor('#ggg'), null);
assert.equal(hexColor('color: #fff'), null);
assert.deepEqual(plain(segments('Banana', 'an')), [
  { text: 'B', match: false },
  { text: 'an', match: true },
  { text: 'an', match: true },
  { text: 'a', match: false },
]);
assert.deepEqual(plain(segments('Banana', '')), [{ text: 'Banana', match: false }]);
assert.deepEqual(plain(segments('Banana', 'x')), [{ text: 'Banana', match: false }]);

console.log('Demo history logic verified.');
