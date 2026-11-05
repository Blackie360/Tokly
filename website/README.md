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

The Return Desk is an original editorial/physical-paper concept: large black type on warm paper, a lilac note, an offset branch card and a change receipt. A native range control reassembles the artifacts into one return ticket. Visitors can choose three fictional projects, drag or use arrow keys, or select **Bring it back**. **Continue working** reveals a focused result, and **Start again** resets the scene. No app or editor opens.

Tabs use Left/Right, Home and End with horizontal ARIA semantics at all widths. Hidden artifacts are removed from the accessibility tree. An adjacent button provides the same continuation path without requiring users to backtrack after finishing the slider. State is in memory only and resets on reload.

Reduced motion disables parallax and transitions; the range still works through static state changes. Static HTML remains readable when JavaScript is unavailable, and script-dependent controls start disabled. FAQs and release links are native HTML.

The shorter copy uses a two-line product description, single-step notes, brief feature text, and concise release caveats. The public download restrictions remain explicit.

See `QA.md` for verification coverage and limitations. This revised art direction is pending production publication approval.
