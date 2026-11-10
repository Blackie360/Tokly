# Tokly

A menu bar clipboard history for macOS, built with Tauri 2 (Rust backend, plain HTML/CSS/JS front end).

## Build and run

```sh
export PATH="$HOME/.cargo/bin:$PATH"
# The default Command Line Tools SDK (27.0) is newer than the installed Swift/clang; build against 26.5.
export SDKROOT=/Library/Developer/CommandLineTools/SDKs/MacOSX26.5.sdk

npm install
npm run build      # -> src-tauri/target/release/bundle/macos/Tokly.app
npm run dev        # run from source
npm test           # Rust unit tests
```

`cargo test -- --include-ignored` (in `src-tauri`) also runs the clipboard round-trip test, which
briefly replaces the real clipboard and then restores it.

## Use

- **⇧⌘C** opens the history (changeable in Preferences). Clicking the menu bar icon or opening the
  app again does the same.
- Type to search. **↩** copies the selected item, **⌥↩** copies and pastes it, **⌥⇧↩** pastes it
  without formatting. **⌘1–9** picks an item directly.
- **⌥P** pins or unpins; pins get a letter and are picked with **⌘ + letter**. **⌥⌫** deletes,
  **⌥⌘⌫** clears unpinned items (add **⇧** to clear pins too).
- **⌥-click** the menu bar icon to pause capturing, **⌥⇧-click** to ignore only the next copy.
- Pasting needs the Accessibility permission. The app is ad-hoc signed, so macOS asks again after
  each rebuild.

## Where things live

- `src-tauri/src/history.rs` — store, de-duplication, limits, pins, search (with tests)
- `src-tauri/src/platform.rs` — NSPasteboard, frontmost app, ⌘V posting
- `src-tauri/src/main.rs` — commands, tray, global shortcut, popup placement, clipboard watcher
- `ui/` — popup (`index.html`, `popup.js`) and preferences (`settings.html`, `settings.js`)
- History: `~/Library/Application Support/com.blackielabs.tokly.clipboard/history`
- Settings: `~/Library/Application Support/com.blackielabs.tokly.clipboard/settings.json`

`TOKLY_KEEP_OPEN=1` keeps the popup up after it loses focus; `--preferences` opens the
preferences window at launch.
