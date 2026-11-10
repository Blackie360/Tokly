# Tokly

Tokly is a clipboard history for the macOS menu bar. Press ⇧⌘C, type a few letters and press return to get back something you copied earlier. Everything stays on your Mac.

- [`clipboard/`](clipboard/README.md): the app. Tauri 2, a Rust backend and a plain HTML/CSS/JS front end. Build, run, test and release instructions are in its README.
- [`website/`](website/README.md): the static site published at https://tokly.blackielabs.com/.

## Checks

```sh
# App (from clipboard/src-tauri)
cargo fmt --check
cargo clippy --all-targets --locked -- -D warnings
cargo test --locked

# Website (from the repository root)
node website/verify.mjs
```

CI runs the same checks and an unsigned universal build on every pull request.

## Release state

Version 0.1.0 is an early build. It is not yet signed with a Developer ID or notarized, and the Homebrew cask is not published. See the release section of `clipboard/README.md`.

## History

Until November 2026 this repository also held Tokly desktop, a local-first project tracker, at the repository root. It was removed; the last commit containing it is `3877a29`, and its prerelease is tagged `v0.2.0`.
