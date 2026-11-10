# Tokly

Tokly is a clipboard history for the macOS menu bar and the Windows and Linux system tray. macOS is the reference version.

- App: `clipboard/`. Tauri 2, Rust backend in `clipboard/src-tauri`, plain HTML/CSS/JS in `clipboard/ui/`. Bundle identifier `com.blackielabs.tokly.clipboard`.
- Operating-system code lives only in `clipboard/src-tauri/src/platform/` (`macos.rs`, and `desktop.rs` for Windows and Linux). Both expose the same functions; keep `cfg` switches out of the rest of the code where possible.
- Website: `website/`, a static page deployed by Vercel to tokly.blackielabs.com from the `website` root directory.

## Rules

- Storing what the user copies is the purpose of this app. Keep it on the user's computer: no network requests, accounts, sync or telemetry.
- Never record copies marked transient, concealed or auto-generated, and keep the ignore lists (apps, pasteboard types, patterns), pause and clear controls working.
- The Accessibility permission is allowed only for pasting on the user's request. Copying an item back must keep working without it.
- Keep the history folder readable by the user's account only.
- Any new capture source or permission prompt must have a switch in Preferences and be described in the website's privacy section.
- Use sentence case and labelled controls in the interface.
- The website's demo is a clearly labelled sample. It must never read the visitor's clipboard.

## Before delivery

- In `clipboard/src-tauri`: `cargo fmt --check`, `cargo clippy --all-targets --locked -- -D warnings` and `cargo test --locked`.
- For website changes: `node website/verify.mjs`.
- CI must stay green on macOS, Windows and Linux. A change that only compiles on one system is not done.
- Do not describe the Windows or Linux build as tested until someone has run it on a real machine; say what was and was not checked.
- Releases go through `.github/workflows/clipboard-release.yml`.
- Do not claim unsigned bundles are release-ready; signing, notarization and real-device testing of the global shortcut, pasting, tray actions and screenshot capture remain release gates.
