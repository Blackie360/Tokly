# Website verification

Reviewed 10 November 2026. Targeted engineering checks, not an accessibility certification or real-device audit.

## Automated

- `node website/verify.mjs`: unique IDs, internal links and ARIA references, local assets, canonical URL, demo and release labels, reduced-motion and focus hooks, buttons disabled until the script runs, no networking, storage or clipboard reads, no third-party URLs, JavaScript syntax and the 60KB budget (currently about 35KB uncompressed).
- `test-interactions.mjs`: runs the shipped script without a DOM and checks adding, de-duplication, the size limit, pin letters and ordering, delete, reset, search, hex detection and match highlighting.

## Browser

Headless Chromium through Playwright, loading `public/index.html` from disk:

- No horizontal overflow at 320, 390, 768 and 1280 CSS pixels. Desktop and 390px full-page screenshots reviewed.
- Demo: sample copy, multi-line item, search with highlighting, return to pick, arrow keys, ⌥P pin with divider and letter, ⌥⌫ delete, empty state, Escape, row click, Pin and Reset buttons. No console or page errors.
- "Copy command" wrote the Homebrew command to the clipboard with permission granted.
- With JavaScript disabled, the static history shows five rows and all eight buttons are disabled.

## Not checked

Safari and Firefox, screen readers, physical phones, OS-level reduced-motion emulation, measured contrast ratios, the clipboard fallback path when permission is denied, and the deployed site. The page has not been published.
