# Return Desk verification

Reviewed 5 November 2026. Targeted engineering checks, not a full accessibility certification or real-device audit.

## Automated checks

- `node website/verify.mjs`: assets, unique IDs, internal links, canonical URL, fictional-demo and private-download labels, reduced-motion/focus hooks, JavaScript syntax and a 60KB public-asset budget.
- `test-interactions.mjs` executes the shipped JavaScript in a minimal DOM model. Covers progressive enhancement, tab roving, project content/reset, range 0/50/100, inert assembled artifacts, alternative assembly, both continuation paths, focus/start again, architecture hints, reduced-motion preference changes and touch parallax suppression.

## Browser checks

- Chrome desktop: native keyboard range controls, project tabs, assembly, both Continue paths and result focus. Finishing the range and pressing Tab reaches the adjacent continuation button. Assembled artifacts no longer duplicate the ticket in the accessibility tree.
- Responsive iframe layouts at 320, 390, 560, 600, 700, 768, 1024 and 1280 CSS pixels: no horizontal document or normal-flow content overflow. Offset artwork stays within its clipped section. Desktop and 390px screenshots reviewed. Narrow-screen project switching and continuation focus passed.
- Mac architecture choice updates guidance; native FAQ controls remain keyboard-operable. UI tests did not trigger a release download.
- A script-omitted fixture retained readable Studio content and disabled script-dependent controls.
- A fixture applies the exact reduced-motion CSS blocks unconditionally: branch transform stayed fixed through range movement, transitions were 0s, ticket animation was none, and continuation focus still worked. The shipped stylesheet uses `prefers-reduced-motion: reduce`. The JavaScript preference path is covered by regression tests. OS preference emulation and physical mobile devices were not tested.

## Contrast and performance

Sampled text/background contrast: ink on paper 14.28:1, muted helper text on paper 6.27:1, ink on lilac 7.79:1, local-data detail on sage 5.62:1, and release detail on ink 9.97:1. The small note signoff and purple-surface focus outline were darkened after review. Important demo and release explanations are at least 14px; small decorative document labels are not used for instructions.

Public HTML/CSS/JavaScript/SVG is approximately 52KB uncompressed and 15KB gzip, with no external fonts, imagery, framework bundle, analytics or third-party script calls. A local cached, unthrottled Chrome fixture observed FCP/LCP 144ms, CLS 0 and no long tasks. This is not a network/mobile benchmark, Lighthouse score or field Core Web Vitals result. QA fixtures are excluded from public output.

## Release and deployment constraints

The v0.2.0 release is private, requires repository access and remains unsigned/unnotarized. Public installers and Homebrew installation are not available. This redesign has not been published to production; it requires publication approval. Vercel project-wide defaults still expect Next.js. Exact-commit static deployments need the per-deployment overrides in README.md. Source and visibility settings remain unchanged.
