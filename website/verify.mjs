import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const root = fileURLToPath(new URL('.', import.meta.url));
const publicRoot = join(root, 'public');
const html = readFileSync(join(publicRoot, 'index.html'), 'utf8');
const css = readFileSync(join(publicRoot, 'style.css'), 'utf8');
const js = readFileSync(join(publicRoot, 'script.js'), 'utf8');

// Structure: unique IDs, working anchors, local assets present.
const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
assert.equal(new Set(ids).size, ids.length, 'HTML IDs must be unique');
for (const [, target] of html.matchAll(/href="#([^"]+)"/g)) assert(ids.includes(target), `Broken internal link: #${target}`);
for (const [, target] of html.matchAll(/aria-(?:controls|describedby|labelledby)="([^"]+)"/g)) assert(ids.includes(target), `Broken ARIA reference: ${target}`);
for (const [, target] of html.matchAll(/(?:src|href)="([^"#][^"]*)"/g)) {
  if (/^(?:https?:|data:)/.test(target)) continue;
  const file = resolve(publicRoot, target);
  assert(file.startsWith(`${publicRoot}/`), 'Local assets must remain inside public/');
  assert(existsSync(file), `Missing local asset: ${target}`);
}
assert(html.includes('<link rel="canonical" href="https://tokly.blackielabs.com/">'), 'Missing canonical website URL');

// Honest labels: the demo, the release state and the privacy caveat.
assert(html.includes('never reads your clipboard'), 'Demo must say it does not read the clipboard');
assert(html.includes('Not yet signed or notarized by Apple'), 'Unsigned release warning must remain');
assert(html.includes('Ordinary text you copy is stored as copied.'), 'Plain-text storage caveat must remain');
const release = html.match(/data-release="(pending|published)"/)?.[1];
assert(release, 'Install section must declare data-release="pending" or "published"');
if (release === 'pending') assert(html.includes('Homebrew cask not published yet'), 'A pending cask must be labelled as not published');
else assert(!html.includes('not published yet'), 'Remove the pending label once the cask is published');

// Accessibility hooks and progressive enhancement.
assert(css.includes('prefers-reduced-motion'), 'Missing reduced-motion support');
assert(css.includes(':focus-visible'), 'Missing keyboard focus styles');
assert(html.includes('role="listbox"') && html.includes('role="combobox"'), 'Missing accessible demo list');
for (const [tag] of html.matchAll(/<button\b[^>]*>/g)) assert(tag.includes(' disabled'), `Script-dependent button must start disabled: ${tag}`);

// The page never reads the clipboard, stores nothing and makes no requests.
assert(!/\b(?:fetch|XMLHttpRequest|WebSocket|localStorage|sessionStorage|readText|sendBeacon)\b/.test(js), 'Demo must not add networking, storage or clipboard reads');
assert(!/clipboard\.read\b/.test(js), 'Demo must not read the clipboard');
assert(!/https?:\/\/(?!tokly\.blackielabs\.com)/.test(html + css), 'No third-party URLs in the page or stylesheet');

execFileSync(process.execPath, ['--check', join(publicRoot, 'script.js')], { stdio: 'inherit' });
execFileSync(process.execPath, [join(root, 'test-interactions.mjs')], { stdio: 'inherit' });

const publicFiles = readdirSync(publicRoot, { recursive: true }).filter((path) => /\.(html|css|js|svg)$/.test(path));
const totalBytes = publicFiles.reduce((sum, path) => sum + readFileSync(join(publicRoot, path)).length, 0);
assert(totalBytes < 60000, 'Static output exceeds the 60KB uncompressed performance budget');
console.log(`Static output: ${totalBytes} bytes; budget <60000 bytes.`);
console.log('Website verified: structure, labels, accessibility hooks, script safety and demo logic.');
