# Tokly website

Static marketing and preview website for the local-first Tokly desktop app. All website source and deployment files live here; the desktop application at the repository root is unchanged.

## Validate

Run `node website/verify.mjs` from the repository root, or `npm test` inside `website/`. The validation runs structural checks, a 60KB uncompressed public-asset budget, and the dependency-free behavior regression suite in `test-interactions.mjs`.

The publishable output is `website/public/`. There are no installation steps, external fonts, runtime dependencies, analytics, or network calls from the demo script. Serve this directory with any static server to preview.

## Vercel deployment

The production hostname is https://tokly.blackielabs.com/ on the existing `tokly` project. Keep the account, domain, DNS, protection, and private repository visibility unchanged. Publish only `website/public/`, never the repository root.

The current project-wide framework still targets the old Next.js site. Deploy this branch with **per-deployment overrides**, rather than changing shared project settings:

- Git source: the exact reviewed commit on `feature/tokly-website`.
- Root directory: `website`.
- Framework: `null` (Other).
- Build command: `node verify.mjs`.
- Install command: empty.
- Output directory: `public`.
- Include source files outside root: false.
- Target: production, when explicitly authorized.

Normal Git-triggered previews may still fail under the old project defaults. Changing those defaults and merging this draft PR are separate actions and must not be assumed from permission to deploy a branch. Do not work around team-access errors through another account or hostname.

## Honest release state

The page links to the v0.2.0 prerelease in the private application repository, explicitly requires repository access, and explains the 404 for visitors without access. There is no public installer or Homebrew command advertised. Replace destinations only after public artifacts, architecture-specific URLs, checksums, and tap instructions have been approved, published, and verified. Do not make the source repository public. Keep the unsigned/unnotarized warning until that release fact changes.

## Interaction

Visitors choose one of three fictional projects, inspect its example changes and saved note, then select **Continue working** to bring that next step into focus. The action does not open a desktop app or editor. Project/pin state exists only in memory and resets on reload.

Tabs support both arrow axes, Home and End, with responsive ARIA orientation. Continue focuses its revealed heading; reset restores the selected tab. Static HTML remains readable with JavaScript unavailable, and script-dependent controls start disabled. FAQs and release links are native HTML.

See `QA.md` for verification coverage and limitations.
