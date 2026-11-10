# Tokly

A clipboard history for the macOS menu bar and the Windows and Linux system tray, built with Tauri 2 (Rust backend, plain HTML/CSS/JS front end). macOS is the original and most complete version; see [Windows and Linux](#windows-and-linux) for what differs.

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

CI (`.github/workflows/ci.yml`) runs the format check, clippy, the tests and an unsigned build for
macOS, Windows and Linux on every pull request.

## Release

Push a tag named `clipboard-v<version>` matching `src-tauri/tauri.conf.json` to run
`.github/workflows/clipboard-release.yml`. It builds a universal macOS app, a Windows installer and a
Linux `.deb`, each with its SHA-256, and creates a GitHub release. With the Apple signing secrets
listed in that workflow it signs and notarizes the macOS app; without them the release is an
unsigned pre-release. The Windows installer is not code-signed. `packaging/tokly.rb` is the Homebrew
cask to publish in a public tap once a signed build is downloadable without signing in.

## Windows and Linux

The same app builds for Windows (x64 installer) and Linux (`.deb`). CI compiles, lints, tests and
bundles both on every pull request, but **neither has been run by hand on a real machine yet**.

What differs from macOS:

- Keys: Ctrl stands in for ⌘ and Alt for ⌥. The history opens with **Alt+Shift+C** by default.
- Tray: on Linux the tray icon only shows its menu (Show history, Pause capturing, Ignore next
  copy), so there are no modifier-click shortcuts. On Windows, Alt-click and Alt+Shift-click work.
- Formats: plain text, HTML, images and files are kept; RTF is not. An item is put back on the
  clipboard as one thing: files, else an image, else text with its HTML.
- Concealed copies: Windows copies flagged `ExcludeClipboardContentFromMonitorProcessing`
  (password managers) are skipped. **Linux has no equivalent check yet**, so use the ignore
  patterns or pause capturing there. The pasteboard-type ignore list only applies on macOS.
- Ignored apps: matched by executable name on Windows (`KeePass.exe` or `KeePass`). Not available
  on Linux, where the frontmost app cannot be read.
- Pasting sends Ctrl+V and needs no permission. Some Wayland compositors refuse synthetic input;
  the item is still copied.
- Screenshot pickup is macOS only.
- Linux needs a system tray (GNOME needs the AppIndicator extension) and a compositor for the
  popup's rounded corners.

Linux build dependencies (Debian/Ubuntu): `libwebkit2gtk-4.1-dev libayatana-appindicator3-dev
librsvg2-dev libxdo-dev libxkbcommon-dev libssl-dev build-essential`.

## Use

- **⇧⌘C** opens the history (changeable in Preferences). Clicking the menu bar icon or opening the
  app again does the same.
- Type to search. **↩** copies the selected item, **⌥↩** copies and pastes it, **⌥⇧↩** pastes it
  without formatting. **⌘1–9** picks an item directly.
- **⌥P** pins or unpins; pins get a letter and are picked with **⌘ + letter**. **⌥⌫** deletes,
  **⌥⌘⌫** clears unpinned items (add **⇧** to clear pins too).
- Screenshots that macOS saves to your screenshot folder are added automatically, without copying
  them first (Preferences → Storage). macOS asks once for access to that folder. HEIC and PDF
  screenshots are skipped.
- **⌥-click** the menu bar icon to pause capturing, **⌥⇧-click** to ignore only the next copy.
- Pasting needs the Accessibility permission. The app is ad-hoc signed, so macOS asks again after
  each rebuild.

## Where things live

- `src-tauri/src/history.rs` — store, de-duplication, limits, pins, search (with tests)
- `src-tauri/src/screenshots.rs` — notices new screenshot files by their macOS screenshot tag (with tests)
- `src-tauri/src/platform/` — clipboard, frontmost app and paste keystroke: `macos.rs` (NSPasteboard,
  ⌘V) and `desktop.rs` (Windows and Linux, built on `arboard`)
- `src-tauri/src/main.rs` — commands, tray, global shortcut, popup placement, clipboard watcher
- `ui/` — popup (`index.html`, `popup.js`) and preferences (`settings.html`, `settings.js`);
  `platform.js` swaps key names and hides Mac-only options off macOS
- History: `~/Library/Application Support/com.blackielabs.tokly.clipboard/history` (plain files, folder
  readable only by your account)
- Settings: `~/Library/Application Support/com.blackielabs.tokly.clipboard/settings.json`

`TOKLY_KEEP_OPEN=1` keeps the popup up after it loses focus; `--preferences` opens the
preferences window at launch.
