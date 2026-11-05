# Tokly desktop

This repository is a local-first macOS project tracker. Windows and Linux are planned for v2.

- UI: React + TypeScript + Vite. Native shell: Tauri 2. Tracking engine: `crates/tracker` (Rust + SQLite + notify + libgit2).
- Keep tracking independent of the webview. Closing the window hides it; explicit Quit stops the process.
- Work only within user-approved workspace roots. Do not add whole-disk scans, editor-history inspection, Accessibility permissions, or cloud telemetry.
- Never store file contents, diffs, credentials, prompts or completions. Preserve local-only operation and no-account onboarding.
- Midnight + Lilac is the chosen theme. Peach identifies a next-step note; mint indicates tracking state. Use sentence case and labelled controls.
- Browser mode is a clearly labelled sample preview, never actual workstation tracking.
- Before delivery: `npm run build`, `npm test`, `npm run test:e2e`, and `cargo test --manifest-path crates/tracker/Cargo.toml`. Run native bundling on macOS via CI.
- Do not claim unsigned bundles are release-ready; signing, notarization, and real-device sleep/wake and login tests remain release gates.
