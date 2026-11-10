# Tokly website

The site published at https://tokly.blackielabs.com/. It is a small React app built with [Astryx](https://astryx.atmeta.com/), Meta's open source design system, using its Chocolate theme, and bundled by Vite into static files.

## Work on it

```sh
cd website
npm ci
npm run dev      # local preview
npm run build    # type-check, build to dist/, then run verify.mjs
npm test         # demo logic tests only
```

- `src/App.tsx` is the page: every section, and the copy as data at the top of the file.
- `src/Demo.tsx` is the working copy of the history popup in the hero. `src/history.js` holds its rules, shared with `test-interactions.mjs`.
- `src/site.css` holds what Astryx does not provide: the ember gradient from the app icon, the popup, the ticker and the drawn feature illustrations.
- `AGENTS.md` is Astryx's guide for coding agents (written by `npx astryx init`). Use `npx astryx build`, `component <Name>` and `docs <topic>` to look things up before changing the layout.

Layout, type, buttons, key caps, cards, the code block and the FAQ are Astryx components. Fonts (Fraunces, Albert Sans, JetBrains Mono) are bundled from `@fontsource-variable` instead of the theme's Google Fonts import, so the page loads nothing from another origin.

## Deployment

Vercel builds this folder: the `tokly` project's Root Directory is `website`, and `vercel.json` sets the Vite preset, `npm ci`, `npm run build` and the `dist` output. Every push to `main` deploys. The build fails if `verify.mjs` fails.

## What verify.mjs enforces

- Required wording ships: the demo never reads the clipboard, the macOS app is not yet signed or notarized, ordinary text is stored as copied, the screenshot folder prompt is disclosed, and Windows and Linux are "In testing, not released yet".
- The install section's `data-release` flag matches its label. It is `pending`, and the command `brew install --cask blackie360/tokly/tokly` is the planned one; no tap exists yet. When the cask is live, confirm the command, set `data-release="published"` and remove the pending wording.
- Site code makes no network requests, uses no storage and never reads the clipboard. The only clipboard write is the copy button on the install command.
- No stylesheet or tag loads a third-party resource.
- Compressed HTML, CSS and JavaScript stay under 330 KB.

See `QA.md` for what was checked by hand.
