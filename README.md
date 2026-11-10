# Tokly

Tokly is a clipboard history that lives in the macOS menu bar or the Windows and Linux system tray. Press ⇧⌘C (Alt+Shift+C on Windows and Linux), type a few letters and press return to get back something you copied earlier. Everything stays on your computer.

- [`clipboard/`](clipboard/README.md): the app. Tauri 2, a Rust backend and a plain HTML/CSS/JS front end. Build, run, test and release instructions are in its README.
- [`website/`](website/README.md): the site published at https://tokly.blackielabs.com/, built with React and the Astryx design system.

## Checks

```sh
# App (from clipboard/src-tauri)
cargo fmt --check
cargo clippy --all-targets --locked -- -D warnings
cargo test --locked

# Website (from website/)
npm ci && npm run build
```

CI runs the same checks and an unsigned build for macOS, Windows and Linux on every pull request.

## Release state

Version 0.1.0 is an early build. The macOS app is not yet signed with a Developer ID or notarized, and the Homebrew cask is not published. The Windows and Linux builds compile and pass their tests in CI but have not been run on real machines yet. See the release section of `clipboard/README.md`.

## History

Until November 2026 this repository also held Tokly desktop, a local-first project tracker, at the repository root. It was removed; the last commit containing it is `3877a29`, and its prerelease is tagged `v0.2.0`.
