# Tokly

This repository holds two macOS apps and their website:

- **Tokly desktop** (repository root): a local-first project tracker. Windows and Linux are planned for v2.
- **Tokly clipboard history** (`clipboard/`): a menu bar clipboard manager. See its section below.
- **Website** (`website/`): the static page for tokly.blackielabs.com, currently about the clipboard app.

## Tokly desktop

These rules apply to everything outside `clipboard/`.

- UI: React + TypeScript + Vite. Native shell: Tauri 2. Tracking engine: `crates/tracker` (Rust + SQLite + notify + libgit2).
- Keep tracking independent of the webview. Closing the window hides it; explicit Quit stops the process.
- Work only within user-approved workspace roots. Do not add whole-disk scans, editor-history inspection, Accessibility permissions, or cloud telemetry.
- Never store file contents, diffs, credentials, prompts or completions. Preserve local-only operation and no-account onboarding.
- Midnight + Lilac is the chosen theme. Peach identifies a next-step note; mint indicates tracking state. Use sentence case and labelled controls.
- Browser mode is a clearly labelled sample preview, never actual workstation tracking.
- Before delivery: `npm run build`, `npm test`, `npm run test:e2e`, and `cargo test --manifest-path crates/tracker/Cargo.toml`. Run native bundling on macOS via CI.
- Do not claim unsigned bundles are release-ready; signing, notarization, and real-device sleep/wake and login tests remain release gates.

## Tokly clipboard history (`clipboard/`)

A separate Tauri 2 app (Rust backend, plain HTML/CSS/JS in `clipboard/ui/`) with its own bundle identifier, `com.blackielabs.tokly.clipboard`. The desktop rules above about stored content and Accessibility do not apply inside `clipboard/`; these do:

- Storing what the user copies is the purpose of this app. Keep it on the Mac: no network requests, accounts, sync or telemetry.
- Never record copies marked transient, concealed or auto-generated, and keep the ignore lists (apps, pasteboard types, patterns), pause and clear controls working.
- The Accessibility permission is allowed only for pasting on the user's request. Copying an item back must keep working without it.
- Keep the history folder readable by the user's account only.
- Any new capture source or permission prompt must have a switch in Preferences and be described on the website's privacy section.
- Before delivery: in `clipboard/src-tauri`, `cargo fmt --check`, `cargo clippy --all-targets --locked -- -D warnings` and `cargo test --locked`. For website changes, `node website/verify.mjs`.
- Releases go through `.github/workflows/clipboard-release.yml`. The same signing and notarization gates apply: do not describe an unsigned build as release-ready.
