# Website verification

Reviewed 10 November 2026. Targeted engineering checks, not an accessibility certification or real-device audit.

## Automated

- `npm run build`: TypeScript check, Vite build, then `verify.mjs` (required wording, release flag, no networking or storage in site code, no third-party loads, reduced-motion and listbox hooks, 330 KB compressed budget; currently about 272 KB).
- `test-interactions.mjs`: adding, de-duplication, the size limit, pin letters and ordering, delete, reset, search, hex detection and match highlighting.
- `npx astryx doctor --built dist`: all checks passed.

## Browser

Headless Chromium through Playwright against `vite preview`:

- No horizontal overflow at 390 and 1320 CSS pixels. Desktop full-page screenshot reviewed.
- Demo: sample copy, multi-line item, search with highlighting, return to pick, arrow keys, Alt+P pin, Alt+Backspace delete, empty state, Reset, and opening an FAQ entry. No console or page errors.
- No request left `localhost` during the session, confirming fonts and styles are bundled.

## Not checked

Safari and Firefox, screen readers, physical phones, light mode (the site is fixed to the dark theme), OS-level reduced-motion emulation, measured contrast ratios, and the install command's copy button.
