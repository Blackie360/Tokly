import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// Dependency-free behavior checks against shipped markup and JavaScript.
// The fake deliberately implements only APIs script.js uses. Browser checks
// are still needed for layout, native range keys and accessibility-tree output.
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
    this.inert = Object.hasOwn(attributes, 'inert');
    this.tabIndex = Number(attributes.tabindex ?? (tag === 'button' ? 0 : -1));
    this.value = attributes.value;
    this.textContent = '';
    this.children = [];
    this.listeners = new Map();
    const styles = new Map();
    this.style = { setProperty: (name, value) => styles.set(name, String(value)), getPropertyValue: name => styles.get(name) || '' };
    const classes = new Set((attributes.class || '').split(/\s+/).filter(Boolean));
    this.classList = {
      contains: value => classes.has(value),
      toggle(value, force) {
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
  getBoundingClientRect() { return { left: 10, top: 20, width: 400, height: 200 }; }
}
// Derive initial attributes from the real page rather than hardcoding the
// disabled, hidden, selected or tab-order states under test.
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
const artifacts = nodes.filter(node => node.classList.contains('artifact'));
const range = get('thread-range');
const scene = get('desk-scene');
const controls = [...tabs, range, get('restore-button'), get('continue-button'), ...radios];
assert.equal(tabs.length, 3);
assert.equal(radios.length, 2);
assert.equal(artifacts.length, 3);
for (const control of controls) assert.equal(control.disabled, true, `${control.id || control.value} must default disabled without JS`);
assert.equal(get('return-ticket').hidden, true);
assert.equal(get('continue-result').hidden, true);
assert.equal(range.value, '0');
assert.equal(get('continue-button').getAttribute('aria-expanded'), 'false');
const mediaListeners = [];
const media = { matches: false, addEventListener(type, fn) { assert.equal(type, 'change'); mediaListeners.push(fn); } };
const document = {
  getElementById: get,
  createElement: tag => new Element(tag),
  querySelectorAll(selector) {
    if (selector === '[data-project]') return tabs;
    if (selector === 'input[name="chip"]') return radios;
    if (selector === '.artifact') return artifacts;
    if (selector === '[data-project], #thread-range, #restore-button, #continue-button, input[name="chip"]') return controls;
    throw new Error(`Unsupported selector: ${selector}`);
  }
};
vm.runInNewContext(script, { document, window: { matchMedia(query) { assert.equal(query, '(prefers-reduced-motion: reduce)'); return media; } } }, { filename: 'public/script.js' });
for (const control of controls) assert.equal(control.disabled, false);
const selected = key => {
  for (const tab of tabs) {
    assert.equal(tab.getAttribute('aria-selected'), String(tab.dataset.project === key));
    assert.equal(tab.tabIndex, tab.dataset.project === key ? 0 : -1);
  }
  assert.equal(get('project-panel').getAttribute('aria-labelledby'), `tab-${key}`);
};
const clickTab = key => { get(`tab-${key}`).click(); selected(key); };
selected('studio');
clickTab('orbit');
assert.equal(get('branch-name').textContent, 'main');
assert.equal(get('branch-project').textContent, 'Orbit / your local project');
assert.equal(get('change-count').textContent, 'Working tree clean');
assert.equal(get('changed-files').children.length, 1);
assert.equal(get('changed-files').children[0].textContent, 'All changes committed.');
assert.equal(get('recent-commit').textContent, 'Make the planets responsive');
assert.equal(get('project-note').textContent, 'Slow the orbit down.');
assert.equal(get('ticket-project').textContent, 'Orbit.');
assert.equal(get('ticket-branch').textContent, 'main · Working tree clean');
assert.equal(get('ticket-note').textContent, get('project-note').textContent);
assert.match(get('demo-status').textContent, /Orbit example selected/);
clickTab('notes');
assert.equal(get('branch-name').textContent, 'feat/journal');
assert.equal(get('change-count').textContent, '2 changed files');
assert.deepEqual(get('changed-files').children.map(row => row.children.map(child => child.textContent)), [['journal.css', 'M'], ['first-entry.md', 'A']]);
assert.equal(get('recent-commit').textContent, 'Create the journal layout');
clickTab('studio');
assert.equal(get('changed-files').children.length, 3);
assert.equal(get('branch-name').textContent, 'feat/components');
const key = (from, pressed, to) => {
  const event = get(`tab-${from}`).dispatch('keydown', { key: pressed });
  assert.equal(event.defaultPrevented, true, `${pressed} prevents page scroll`);
  selected(to);
  assert.equal(activeElement, get(`tab-${to}`));
};
key('studio', 'ArrowRight', 'orbit');
key('orbit', 'ArrowRight', 'notes');
key('notes', 'ArrowRight', 'studio');
key('studio', 'ArrowLeft', 'notes');
key('notes', 'ArrowLeft', 'orbit');
key('orbit', 'Home', 'studio');
key('studio', 'End', 'notes');
for (const pressed of ['Tab', 'ArrowDown', 'ArrowUp', 'Enter']) {
  assert.equal(get('tab-notes').dispatch('keydown', { key: pressed }).defaultPrevented, false);
  selected('notes');
}
const assertProgress = value => {
  const complete = value === 100;
  assert.equal(range.value, String(value));
  assert.equal(scene.style.getPropertyValue('--p'), String(value / 100));
  assert.equal(get('progress-label').textContent, `${String(value).padStart(2, '0')} / 100`);
  assert.equal(get('return-ticket').hidden, !complete);
  assert.equal(scene.classList.contains('is-assembled'), complete);
  for (const artifact of artifacts) {
    assert.equal(artifact.inert, complete);
    assert.equal(artifact.getAttribute('aria-hidden'), String(complete));
  }
};
const input = value => { range.value = String(value); range.dispatch('input'); assertProgress(value); };
input(0);
input(50);
assert.match(range.getAttribute('aria-valuetext'), /50% reassembled/);
assert.equal(get('restore-label').textContent, 'Bring it back');
input(100);
assert.match(range.getAttribute('aria-valuetext'), /Fieldnotes context reassembled/);
assert.match(get('demo-status').textContent, /Continue working is now available/);
assert.equal(get('restore-label').textContent, 'Continue working');
const assertContinued = () => {
  assert.equal(get('continue-result').hidden, false);
  assert.equal(get('continue-button').hidden, true);
  assert.equal(get('continue-button').getAttribute('aria-expanded'), 'true');
  assert.equal(get('ticket-state').textContent, 'YOUR THREAD, PICKED UP');
  assert.equal(get('restore-label').textContent, 'Start again');
  assert.equal(activeElement, get('continue-title'));
};
const assertReset = () => {
  assertProgress(0);
  assert.equal(get('continue-result').hidden, true);
  assert.equal(get('continue-button').hidden, false);
  assert.equal(get('continue-button').getAttribute('aria-expanded'), 'false');
  assert.equal(get('ticket-state').textContent, 'CONTEXT REASSEMBLED');
  assert.equal(get('restore-label').textContent, 'Bring it back');
};
// The adjacent action continues directly after the user finishes the slider.
get('restore-button').click();
assertContinued();
get('restore-button').click();
assertReset();
assert.equal(activeElement, range);
assert.match(get('demo-status').textContent, /Context scattered/);
// The alternative to dragging assembles and focuses the newly available action.
get('restore-button').click();
assertProgress(100);
assert.equal(activeElement, get('continue-button'));
assert.equal(get('continue-result').hidden, true);
get('continue-button').click();
assertContinued();
// Moving away from completion clears the result and restores artifact access.
input(50);
assert.equal(get('continue-result').hidden, true);
assert.equal(get('continue-button').hidden, false);
assert.equal(get('continue-button').getAttribute('aria-expanded'), 'false');
input(100);
get('continue-button').click();
clickTab('orbit');
assertReset();
assert.equal(get('ticket-project').textContent, 'Orbit.');
get('restore-button').click();
get('continue-button').click();
get('restore-button').click();
assertReset();
for (const [value, label] of [['intel', 'Intel'], ['silicon', 'Apple Silicon']]) {
  radios.find(radio => radio.value === value).dispatch('change');
  assert.equal(get('chip-hint').textContent, `On GitHub, choose the ${label} asset.`);
}
scene.dispatch('pointermove', { pointerType: 'mouse', clientX: 310, clientY: 70 });
assert.equal(scene.style.getPropertyValue('--mx'), '0.25');
assert.equal(scene.style.getPropertyValue('--my'), '-0.25');
scene.dispatch('pointerleave');
assert.equal(scene.style.getPropertyValue('--mx'), '0');
assert.equal(scene.style.getPropertyValue('--my'), '0');
scene.dispatch('pointermove', { pointerType: 'touch', clientX: 410, clientY: 220 });
assert.equal(scene.style.getPropertyValue('--mx'), '0');
scene.dispatch('pointermove', { pointerType: 'mouse', clientX: 310, clientY: 70 });
media.matches = true;
assert.equal(mediaListeners.length, 1);
mediaListeners.forEach(fn => fn());
assert.equal(scene.style.getPropertyValue('--mx'), '0');
assert.equal(scene.style.getPropertyValue('--my'), '0');
scene.dispatch('pointermove', { pointerType: 'mouse', clientX: 410, clientY: 220 });
assert.equal(scene.style.getPropertyValue('--mx'), '0', 'Reduced motion disables pointer parallax');
assert.equal(scene.style.getPropertyValue('--my'), '0');
console.log('Interaction tests passed: progressive enhancement, tab roving, project content and reset, range 0/50/100, inert artifacts, alternative assembly, continuation/focus/start again, Mac hints, and reduced-motion parallax.');
