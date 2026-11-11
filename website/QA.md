# Website verification

Reviewed 10 November 2026. Targeted engineering checks, not an accessibility certification or real-device audit.

## Automated

- `npm run build`: TypeScript check, Vite build, then `verify.mjs` (required wording, release flag, installer scripts present and checksum-verifying, no networking or storage in site code, no third-party loads, reduced-motion and listbox hooks, 350 KB compressed budget; currently about 318 KB).
- `test-interactions.mjs`: the demo's history rules.
- `npx astryx doctor --built dist`.

## Browser

Headless Chromium through Playwright against `vite preview`:

- Page height in screens: exactly 2.00 at 1280×720, 1440×900, 1920×1080, 768×1024 and 412×915; 2.01 at 390×844; 2.06 at 390×800; 2.28 at 375×667. It stays 2.00 on every tab at 1440×900.
- No horizontal overflow at any of those sizes.
- Demo: search with highlighting, return to pick, arrow keys, Alt+P pin. Tabs and the system switcher change their panels. No console or page errors.

## Not checked

Safari and Firefox, screen readers, physical phones, light mode (the site is fixed to the dark theme), and the copy button on the install command. The install scripts are exercised by the release workflow, not by this page's checks.
