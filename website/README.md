# Tokly website

Static marketing website for Tokly clipboard history, the menu bar clipboard manager in `clipboard/`. All website source and deployment files live here. It replaces the earlier Return Desk page for the project tracker, which remains in Git history.

## Validate

Run `node website/verify.mjs` from the repository root, or `npm test` inside `website/`. The script checks structure and ARIA references, the honesty labels listed below, script safety, a 60KB uncompressed public-asset budget, and the demo's history logic in `test-interactions.mjs`.

The publishable output is `website/public/`. There are no installation steps, external fonts, runtime dependencies, analytics or network calls. Serve the directory with any static server, or open `public/index.html` directly.

## Vercel deployment

The production hostname is https://tokly.blackielabs.com/ on the existing `tokly` Vercel project. Publish only `website/public/`, never the repository root.

`vercel.json` in this directory sets framework `null`, build command `node verify.mjs`, an empty install command and output directory `public`. The project's root directory must be `website` for those to apply; Git-triggered deployments from the repository root have been failing.

## Release state on the page

- The install section is marked `data-release="pending"` and labelled "Homebrew cask not published yet". The command shown, `brew install --cask blackie360/tokly/tokly`, is the planned one; no tap exists yet. When the cask is live, confirm the command, set `data-release="published"` and remove the pending wording. `verify.mjs` enforces that the two stay in step.
- Version 0.1.0 is described as not yet signed or notarized. Keep that until it changes.
- The privacy section states that ordinary copied text is stored as copied. Keep it accurate to the app.

## Demo

The hero contains a working copy of the history popup. Sample "Copy" buttons add items to it; visitors can search, move with the arrow keys, press return to pick, pin with ⌥P and delete with ⌥⌫, or use the Pin, Delete and Reset buttons. It mirrors the app's rules: repeated copies move to the top, pins take letters from the app's list and sort first, and hex colors get a swatch.

Everything is held in memory and resets on reload. The script never reads the clipboard. Its only clipboard write is the "Copy command" button in the install section. Without JavaScript the popup is a static list and script-dependent buttons stay disabled.

See `QA.md` for what was checked.
