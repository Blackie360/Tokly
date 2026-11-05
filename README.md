# Tokly

Desktop version 0.2.0 adds Continue Working cards with persistent pins and selectable Git history.

**Pick up where you left off.** Tokly is a local-first desktop companion that discovers Git projects inside workspace folders you choose, records file activity, and keeps your next step close.

This rebuild replaces the previous AI usage platform. No server, login, API billing, token telemetry, or cloud database is required. Version 1 targets macOS 12+; Windows and Linux are planned for version 2.

## Run on a Mac

Install Node.js 22+, the current stable Rust toolchain, and Xcode Command Line Tools (`xcode-select --install`). Then:

```sh
npm ci
npm run desktop
```

Choose a parent workspace such as `~/Projects`. Tokly discovers repositories up to 12 directory levels deep, including Git worktrees. Continue working in any editor or agent; Tokly observes file changes without needing projects opened in its own window. Closing the window leaves tracking in the menu bar. Choose **Quit Tokly** to exit. Launch at login is opt-in in Settings.

Choose **Preferred editor** in Settings. Tokly detects supported installed Mac apps through the system application registry: Visual Studio Code, Cursor, Zed, Xcode, Sublime Text 4, BBEdit, Nova, IntelliJ IDEA, WebStorm, PyCharm, and VS Code Insiders. Automatic uses the first installed choice in that order; Finder is the fallback when none are available. Your explicit choice persists across relaunches. If it is removed or fails to open, Tokly opens Finder and explains the fallback. Use **Refresh installed editors** after installing an editor; detection also refreshes when the window gains focus. **Open folder** always uses Finder. No editor plugin is required for filesystem tracking. Merely opening an editor or folder is not recorded as work; v1 cannot attribute changes to a particular editor, person, or agent.

## What works

- Native folder approval, automatic Git discovery, exclusions and restoring excluded projects.
- Debounced file activity with metadata stored in local SQLite.
- Branch, working-tree changes, recent commits, and disconnected-folder status.
- Continue working cards with saved next steps, branch, working-tree status and direct editor access.
- Pin projects to keep them first; pins and next-step notes persist locally.
- Overview, project Activity / Changes / Notes, weekly progress, and Settings.
- Automatic monitoring after folder approval, menu bar access, close-to-background, and opt-in login startup.
- Configurable 7 / 30 / 90 / 365-day activity retention.
- Midnight + Lilac interface with peach notes, mint status, keyboard focus and reduced-motion support.

## Privacy and limits

Only approved parent folders are scanned; directory symlinks are not followed. Dependencies, caches and build folders are skipped. Git-ignored files are omitted from file-event records. SQLite lives in the app's macOS Application Support directory under identifier `com.blackielabs.tokly`; it stores paths, timestamps, branch names, filenames, commit summaries/SHAs, notes and settings, never source contents or diffs. There are no network integrations or AI calls.

Git history defaults to seven days; choose 7, 30 or 90 days in a project’s Activity tab to import and display commits reachable from the current branch, from all authors. The shorter of history and retention applies; these are repository activity, not a measure of your personal productivity. Imported commits are deduplicated by repository and SHA and then retained for your selected duration. Activity follows the currently checked-out HEAD: switching branches replaces active membership, while previously collected entries remain hidden until retention expires. An activity scan is capped at 10,000 commits. Older branch tips are identified explicitly so an empty history does not imply a missing repository. Reducing the history window hides older commits without deleting them; retention controls deletion. File activity shown in the interface and weekly chart is limited to the latest 500 retained file events. Neither edit counts nor commits represent completed tasks or hours worked.

The separate **Git graph** tab reads all locally available commits reachable from every stored Git ref plus HEAD, with no date or 10,000-commit cap. Local branches, already-known remote branches, tags, other refs and detached HEAD are labelled. It does not fetch, pull, check out branches or modify repositories; unreachable objects and reflog-only history are excluded. Full commit subjects are displayed as text; message bodies are not collected. Ordered parent edges, merge lanes, off-page continuations and shallow/missing-object boundaries are explicit. Animation is brief and disabled for reduced-motion preferences.

Graph metadata is held in a single-project memory cache, separately from SQLite retention. Initial loading walks available ancestry (memory/time grow with repository size), then serves 50-commit pages from a stable ref snapshot. Changed refs require a refreshed snapshot, preventing duplicated or skipped commits between pages. The graph runs outside the tracking/database lock. A 10,051-commit fixture covers history beyond the activity cap. Existing notes, settings and cached activity are preserved through additive schema migration.

The watcher batches saves with a two-second quiet period. It reconciles discovery and Git state every minute and after observed changes. On wake, reconciliation resumes; after downtime, current Git state can be recovered but missing edit events cannot. A bounded notification queue protects memory; overflow can lose edit history but the next scan repairs current Git state. Workspace scanning currently holds the database lock, so very large workspaces may delay snapshots. Keep roots focused on development workspaces. Monitoring starts automatically for approved folders whenever Tokly runs, including after relaunch. Quit Tokly to stop monitoring; launch at login remains opt-in. Exclusion stops future collection but keeps existing records and notes locally; removing the last approving workspace deletes the affected project records and notes.

## Browser preview

```sh
npm ci
npm run dev
```

Open `http://localhost:1420`, then **Explore a sample workspace**. The preview uses synthetic data in browser localStorage; it cannot access local folders, run Git, open Cursor or enable login startup. Notes and preferences work within that sample. **Reset sample workspace** clears it. Real tracking is only available in the native application.

## Build and verify

```sh
npm run build
npm test
npm run test:e2e
cargo test --manifest-path crates/tracker/Cargo.toml --locked
cargo clippy --manifest-path crates/tracker/Cargo.toml --all-targets -- -D warnings
# On macOS:
npm run tauri -- build --bundles app --no-sign
```

Install the browser once with `npx playwright install chromium`. CI builds unsigned macOS app bundles for Apple Silicon and Intel and uploads them as workflow artifacts. The app is zipped with macOS metadata to preserve executable permissions. These are developer test builds, not notarized releases. Signing/notarization requires the owner's Apple Developer identity and credentials, not included in this repository. macOS folder permissions, Finder/Cursor opening, login startup, menu bar behavior, and sleep/wake recovery need real-Mac acceptance testing before shipping.

## Architecture

```mermaid
flowchart TD
  F[Approved workspace folders] --> W[Native watcher]
  W --> B[Debounce and filter]
  F --> G[Git discovery and inspection]
  B --> D[Local SQLite]
  G --> D
  N[Next-step notes] --> D
  D --> U[React desktop interface]
```

- `crates/tracker`: platform-neutral tracking engine, persistence and tests.
- `src-tauri`: native commands, folder chooser, menu bar and lifecycle.
- `src`: desktop UI plus an explicitly separated browser sample adapter.
- `.github/workflows/ci.yml`: interface tests and macOS build matrix.

Workspace settings report each approved folder's latest scan, repository count and incomplete/unavailable status, with explicit limits and recovery steps. Scanning never grants permissions or clones repositories. Paths, filenames, commit subjects and notes may be sensitive local data; Tokly's database is not application-encrypted. Protect the Mac and any exports. Other editors, backup services and shared folders have their own data policies.

See [Mac distribution readiness](docs/RELEASE_READINESS.md) for the current signing, notarization and public-download blockers.

Next-step notes keep a recovery draft in local webview storage on each edit, then autosave to SQLite after a short quiet period. Saves are serialized per note so an older reply cannot replace a newer edit; switching projects and reloading keep pending drafts. Save/storage errors remain visible with manual retry. Recovery storage and SQLite are local and not encrypted by Tokly. Removing a workspace also clears its affected recovery drafts, while excluded projects keep their notes.

**Settings → Export note backup** saves a versioned JSON file with project names/paths, saved notes and pending recovery drafts kept separately (including drafts whose projects are no longer listed). Native export uses a save dialog and an atomic owner-only file write; cancellation does not write a file. Keep exports private, especially in cloud-synced folders. Exported files are independent of activity retention; there is no import UI yet.

Editor shortcuts use the installed macOS app bundle's icon through NSWorkspace, converted locally to a PNG for display. No editor-brand assets are downloaded or bundled. Missing, oversized or undecodable icons fall back to editor initials; accessible names/tooltips and launch targets are unchanged. Browser samples use initials because they cannot inspect installed apps.

Each project has a stack of up to 12 individually colored sticky notes. Existing next-step text becomes the first peach note without changing it. Choose a numbered note to bring it forward; the selected note is remembered and appears in Continue working. Every note has its own autosave/recovery draft. Version 2 JSON backups include all notes, colors, ordering, selection and pending drafts. There is no note deletion or backup import UI yet.

Return cards show the latest recorded activity, saved next step, branch/HEAD and editor shortcuts. An explicit **Resume project** action remembers the latest observed Git context. Notes capture that context when saved. Comparisons report branch, HEAD and changed-file-list differences, with scan timestamps; they do not infer intent or detect additional edits inside an already changed file. Legacy notes have no invented context. No file contents or diffs are collected.
