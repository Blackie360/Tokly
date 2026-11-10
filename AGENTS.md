# Tokly

Tokly is a menu bar clipboard history for macOS.

- App: `clipboard/`. Tauri 2, Rust backend in `clipboard/src-tauri`, plain HTML/CSS/JS in `clipboard/ui/`. Bundle identifier `com.blackielabs.tokly.clipboard`.
- Website: `website/`, a static page deployed by Vercel to tokly.blackielabs.com from the `website` root directory.

## Rules

- Storing what the user copies is the purpose of this app. Keep it on the Mac: no network requests, accounts, sync or telemetry.
- Never record copies marked transient, concealed or auto-generated, and keep the ignore lists (apps, pasteboard types, patterns), pause and clear controls working.
- The Accessibility permission is allowed only for pasting on the user's request. Copying an item back must keep working without it.
- Keep the history folder readable by the user's account only.
- Any new capture source or permission prompt must have a switch in Preferences and be described in the website's privacy section.
- Use sentence case and labelled controls in the interface.
- The website's demo is a clearly labelled sample. It must never read the visitor's clipboard.

## Before delivery

- In `clipboard/src-tauri`: `cargo fmt --check`, `cargo clippy --all-targets --locked -- -D warnings` and `cargo test --locked`.
- For website changes: `node website/verify.mjs`.
- Releases go through `.github/workflows/clipboard-release.yml`.
- Do not claim unsigned bundles are release-ready; signing, notarization and real-device testing of the global shortcut, pasting, tray actions and screenshot capture remain release gates.
