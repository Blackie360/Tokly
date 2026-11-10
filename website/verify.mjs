import assert from 'node:assert/strict';
import {readFileSync, existsSync, readdirSync, statSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {gzipSync} from 'node:zlib';

// Checks the built site in dist/. Run after `vite build` (npm run build does both).
const root = fileURLToPath(new URL('.', import.meta.url));
const dist = join(root, 'dist');
assert(existsSync(join(dist, 'index.html')), 'Build the site first: npm run build');

const files = readdirSync(dist, {recursive: true}).map(String).filter((path) => statSync(join(dist, path)).isFile());
const read = (path) => readFileSync(join(dist, path), 'utf8');
const html = read('index.html');
const scripts = files.filter((path) => path.endsWith('.js')).map(read).join('\n');
const styles = files.filter((path) => path.endsWith('.css')).map(read).join('\n');
const source = ['App.tsx', 'Demo.tsx', 'history.js', 'main.tsx']
  .map((name) => readFileSync(join(root, 'src', name), 'utf8'))
  .join('\n');

// Metadata and assets.
assert(html.includes('<link rel="canonical" href="https://tokly.blackielabs.com/"'), 'Missing canonical website URL');
for (const [, target] of html.matchAll(/(?:src|href)="(\/[^"]+)"/g)) assert(existsSync(join(dist, target)), `Missing asset: ${target}`);
for (const script of ['install.sh', 'install.ps1']) {
  assert(existsSync(join(dist, script)), `Missing installer script: ${script}`);
  assert(read(script).includes('Blackie360/Tokly') && /sha256/i.test(read(script)), `${script} must download from the Tokly repo and verify a checksum`);
}

// Honest labels: the demo, the release state and the privacy caveat must ship.
const mustShip = [
  'never reads your clipboard',
  'Not yet signed or notarized by Apple',
  'Ordinary text you copy is stored as copied.',
  'access to your screenshot folder',
  'Early build: installed and started in automated tests',
];
for (const phrase of mustShip) assert(scripts.includes(phrase), `Missing required wording: ${phrase}`);
const release = source.match(/data-release="(pending|published)"/)?.[1];
assert(release, 'Install section must declare data-release="pending" or "published"');
if (release === 'pending') assert(scripts.includes('Homebrew cask not published yet'), 'A pending cask must be labelled as not published');
else assert(!scripts.includes('not published yet'), 'Remove the pending label once the cask is published');

// Our own code never reads the clipboard, stores nothing and makes no requests.
assert(!/\b(?:fetch|XMLHttpRequest|WebSocket|localStorage|sessionStorage|readText|sendBeacon)\b/.test(source), 'Site code must not add networking, storage or clipboard reads');
// Nothing is loaded from another origin: fonts and styles are bundled.
assert(!/url\(\s*['"]?https?:/.test(styles) && !/@import\s+url\(\s*['"]?https?:/.test(styles), 'Stylesheets must not load third-party resources');
assert(!/<(?:script|link)[^>]+(?:src|href)="https?:\/\/(?!tokly\.blackielabs\.com)/.test(html), 'The page must not load third-party scripts or styles');

// Accessibility hooks.
assert(styles.includes('prefers-reduced-motion'), 'Missing reduced-motion support');
assert(source.includes('role="listbox"') && source.includes('role="combobox"'), 'Missing accessible demo list');

execFileSync(process.execPath, [join(root, 'test-interactions.mjs')], {stdio: 'inherit'});

// Budget: compressed JavaScript and CSS the browser must download (fonts load on demand).
const gzip = files.filter((path) => /\.(js|css|html)$/.test(path)).reduce((sum, path) => sum + gzipSync(readFileSync(join(dist, path))).length, 0);
assert(gzip < 350_000, `Compressed HTML/CSS/JS is ${gzip} bytes; budget is 350000`);
console.log(`Compressed HTML/CSS/JS: ${gzip} bytes; budget <350000.`);
console.log('Website verified: metadata, required wording, no third-party loads, accessibility hooks and demo logic.');
