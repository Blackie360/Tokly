import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// Dependency-free behavior regression tests. These deliberately model only the
// DOM APIs used by script.js; browser tests remain necessary for layout, native
// keyboard activation, accessibility-tree output, and actual focus rendering.
const html = readFileSync(new URL('public/index.html', import.meta.url), 'utf8');
const script = readFileSync(new URL('public/script.js', import.meta.url), 'utf8');
let activeElement = null;
class Element {
  constructor(tag = 'div', attributes = {}) {
    this.tagName = tag.toUpperCase();
    this.attributes = { ...attributes };
    this.id = attributes.id || '';
    this.dataset = attributes['data-project'] ? { project: attributes['data-project'] } : {};
    this.disabled = Object.hasOwn(attributes, 'disabled');
    this.hidden = Object.hasOwn(attributes, 'hidden');
    this.tabIndex = Number(attributes.tabindex ?? (tag === 'button' ? 0 : -1));
    this.value = attributes.value;
    this.textContent = '';
    this.children = [];
    this.listeners = new Map();
    const classes = new Set((attributes.class || '').split(/\s+/).filter(Boolean));
    this.classList = {
      add: value => classes.add(value),
      remove: value => classes.delete(value),
      contains: value => classes.has(value),
      toggle: (value, force) => {
        const enabled = force ?? !classes.has(value);
        enabled ? classes.add(value) : classes.delete(value);
        return enabled;
      }
    };
  }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  getAttribute(name) { return this.attributes[name] ?? null; }
  addEventListener(type, listener) {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type).push(listener);
  }
  dispatch(type, extra = {}) {
    const event = { defaultPrevented: false, preventDefault() { this.defaultPrevented = true; }, ...extra };
    for (const listener of this.listeners.get(type) || []) listener(event);
    return event;
  }
  click() { assert.equal(this.disabled, false, `${this.id} must be enabled`); this.dispatch('click'); }
  focus() { activeElement = this; }
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this.children = children; }
  querySelector(selector) {
    assert.equal(selector, 'span', 'Extend the fake explicitly for new DOM APIs');
    return this.children.find(child => child.tagName === 'SPAN') || null;
  }
}
// Read real element attributes from the shipped HTML so initial hidden,
// disabled, ARIA, and data-project state cannot silently drift from tests.
const nodes = [...html.matchAll(/<([a-z][\w-]*)\b([^>]*)>/gi)].map(([, tag, raw]) => {
  const attributes = {};
  for (const [, name, quoted, single, bare] of raw.matchAll(/([^\s=\/]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)) {
    attributes[name] = quoted ?? single ?? bare ?? '';
  }
  return new Element(tag, attributes);
});
const ids = new Map(nodes.filter(node => node.id).map(node => [node.id, node]));
const get = id => { assert(ids.has(id), `Missing shipped HTML element #${id}`); return ids.get(id); };
const tabs = nodes.filter(node => node.dataset.project);
const radios = nodes.filter(node => node.tagName === 'INPUT' && node.attributes.name === 'chip');
const tablist = nodes.find(node => node.attributes.role === 'tablist');
const controls = [...tabs, get('pin-button'), get('continue-button'), get('reset-demo'), ...radios];
get('pin-button').append(new Element('span'));
assert.equal(tabs.length, 3);
assert.equal(radios.length, 2);
for (const control of controls) assert.equal(control.disabled, true, `${control.id || control.value} must default disabled without JS`);
assert.equal(get('return-result').hidden, true);
const mediaListeners = [];
const media = { matches: false, addEventListener(type, fn) { assert.equal(type, 'change'); mediaListeners.push(fn); } };
const document = {
  getElementById: get,
  createElement: tag => new Element(tag),
  querySelector(selector) { assert.equal(selector, '[role="tablist"]'); return tablist; },
  querySelectorAll(selector) {
    if (selector === '[data-project]') return tabs;
    if (selector === 'input[name="chip"]') return radios;
    if (selector === '[data-project], #pin-button, #continue-button, #reset-demo, input[name="chip"]') return controls;
    throw new Error(`Unsupported selector: ${selector}`);
  }
};
vm.runInNewContext(script, { document, window: { matchMedia(query) { assert.equal(query, '(max-width: 560px)'); return media; } } }, { filename: 'public/script.js' });
for (const control of controls) assert.equal(control.disabled, false);
assert.equal(tablist.getAttribute('aria-orientation'), 'horizontal');
media.matches = true;
mediaListeners.forEach(fn => fn());
assert.equal(tablist.getAttribute('aria-orientation'), 'vertical');
media.matches = false;
mediaListeners.forEach(fn => fn());
assert.equal(tablist.getAttribute('aria-orientation'), 'horizontal');

const selected = key => {
  for (const tab of tabs) {
    assert.equal(tab.getAttribute('aria-selected'), String(tab.dataset.project === key));
    assert.equal(tab.tabIndex, tab.dataset.project === key ? 0 : -1);
  }
  assert.equal(get('project-panel').getAttribute('aria-labelledby'), `tab-${key}`);
};
const clickTab = key => { get(`tab-${key}`).click(); selected(key); };
clickTab('orbit');
assert.equal(get('project-name').textContent, 'Orbit');
assert.equal(get('project-branch').textContent, 'main');
assert.equal(get('project-changes').textContent, 'Working tree clean');
assert.equal(get('changed-files').children.length, 1);
assert.equal(get('changed-files').children[0].className, 'clean-state');
assert.match(get('changed-files').children[0].textContent, /All changes committed/);
assert.match(get('demo-status').textContent, /Orbit example selected.*Next step:/);
assert.equal(get('pin-button').getAttribute('aria-pressed'), 'false');
get('pin-button').click();
assert.equal(get('pin-button').getAttribute('aria-pressed'), 'true');
assert.equal(get('pin-button').getAttribute('aria-label'), 'Unpin Orbit in this demo');
assert(get('pin-button').classList.contains('is-pinned'));
assert.match(get('demo-status').textContent, /Orbit pinned.*example only/);
clickTab('notes');
assert.equal(get('project-name').textContent, 'Fieldnotes');
assert.equal(get('project-changes').textContent, '2 changed files');
assert.deepEqual(get('changed-files').children.map(row => row.children.map(child => child.textContent)), [['journal.css', 'Modified'], ['first-entry.md', 'Added']]);
assert.equal(get('commit-one').textContent, 'Create the journal layout');
assert.equal(get('commit-two').textContent, 'Refine the type scale');
assert.equal(get('pin-button').getAttribute('aria-pressed'), 'false');
clickTab('orbit');
assert.equal(get('pin-button').getAttribute('aria-pressed'), 'true', 'Pin state persists per project');
get('pin-button').click();
assert.equal(get('pin-button').getAttribute('aria-pressed'), 'false');
assert(!get('pin-button').classList.contains('is-pinned'));
assert.equal(get('pin-button').querySelector('span').textContent, 'Pin project');
clickTab('studio');
assert.equal(get('changed-files').children.length, 3);
assert.equal(get('pin-button').getAttribute('aria-pressed'), 'true', 'Other projects retain independent pin state');

get('continue-button').click();
assert.equal(get('return-result').hidden, false);
assert.equal(get('continue-button').getAttribute('aria-expanded'), 'true');
assert(get('return-studio').classList.contains('is-continued'));
assert.equal(activeElement, get('result-title'));
assert.equal(get('result-title').textContent, 'Back to Studio.');
assert.equal(get('result-note').textContent, get('project-note').textContent);
get('reset-demo').click();
assert.equal(get('return-result').hidden, true);
assert.equal(get('continue-button').getAttribute('aria-expanded'), 'false');
assert(!get('return-studio').classList.contains('is-continued'));
assert.equal(activeElement, get('tab-studio'));
get('continue-button').click();
clickTab('notes');
assert.equal(get('return-result').hidden, true, 'Changing project closes previous result');
assert.equal(get('continue-button').getAttribute('aria-expanded'), 'false');
assert.equal(get('result-title').textContent, 'Back to Fieldnotes.');

const key = (from, pressed, to) => {
  const event = get(`tab-${from}`).dispatch('keydown', { key: pressed });
  assert.equal(event.defaultPrevented, true, `${pressed} prevents page scroll`);
  selected(to);
  assert.equal(activeElement, get(`tab-${to}`));
};
key('notes', 'ArrowRight', 'studio');
key('studio', 'ArrowLeft', 'notes');
key('notes', 'Home', 'studio');
key('studio', 'End', 'notes');
key('notes', 'ArrowDown', 'studio');
key('studio', 'ArrowUp', 'notes');
key('notes', 'ArrowLeft', 'orbit');
key('orbit', 'ArrowRight', 'notes');
const unhandled = get('tab-notes').dispatch('keydown', { key: 'Tab' });
assert.equal(unhandled.defaultPrevented, false, 'Native Tab navigation is preserved');
selected('notes');
for (const [value, label] of [['intel', 'Intel'], ['silicon', 'Apple Silicon']]) {
  radios.find(radio => radio.value === value).dispatch('change');
  assert.equal(get('chip-hint').textContent, `Have repository access? Choose the ${label} asset on GitHub.`);
}
console.log('Interaction tests passed: progressive enhancement, project content, pin isolation, result focus/reset, keyboard navigation, responsive ARIA, and Mac hints.');
