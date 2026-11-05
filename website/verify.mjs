import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
const root=fileURLToPath(new URL('.',import.meta.url));
const publicRoot=join(root,'public');
const html=readFileSync(join(publicRoot,'index.html'),'utf8');
const css=readFileSync(join(publicRoot,'style.css'),'utf8');
const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(match=>match[1]);
assert.equal(new Set(ids).size,ids.length,'HTML IDs must be unique');
for(const [,target] of html.matchAll(/href="#([^"]+)"/g)) assert(ids.includes(target),`Broken internal link: #${target}`);
for(const [,target] of html.matchAll(/(?:src|href)="([^"#][^"]*)"/g)){
  if(/^(?:https?:|data:)/.test(target))continue;
  const file=resolve(publicRoot,target);
  assert(file.startsWith(`${publicRoot}/`),'Local assets must remain inside public/');
  assert(existsSync(file),`Missing local asset: ${target}`);
}
assert(html.includes('https://tokly.blackielabs.com/'),'Missing canonical website URL');
assert(html.includes('Interactive example'),'Demo data must be identified');
assert(html.includes('unsigned and not notarized'),'Unsigned release warning must remain');
assert(css.includes('prefers-reduced-motion'),'Missing reduced-motion support');
assert(css.includes(':focus-visible'),'Missing keyboard focus styles');
assert(html.includes('role="tablist"')&&html.includes('role="tabpanel"'),'Missing accessible demo tabs');
execFileSync(process.execPath,['--check',join(publicRoot,'script.js')],{stdio:'inherit'});
console.log('Website verified: assets, anchors, metadata, demo labels, prerelease warning, accessibility hooks, and JavaScript syntax.');
