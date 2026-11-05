# Website verification

Reviewed 5 November 2026. These are targeted engineering checks, not a claim of a full accessibility certification or real-device audit.

## Automated checks

- `node website/verify.mjs`: valid local assets, unique IDs, internal links, canonical URL, explicit sample data/private-download warnings, reduced-motion/focus hooks, JavaScript syntax, and a 60KB public-asset budget.
- `test-interactions.mjs`: executes the shipped JavaScript with a minimal DOM model. Checks default-disabled progressive enhancement, selected tab and panel labels, changed/clean file rows, independent pin state, continuation expansion and focus, reset, all arrow keys/Home/End, native Tab preservation, responsive ARIA orientation, and Mac architecture guidance.

## Browser checks

- Chrome, desktop: project switching, Home/End/Arrow navigation, native Tab focus, a visible 3px panel focus outline, pins persisting between sample projects, Continue revealing and focusing the result, and reset restoring the selected tab.
- Responsive iframe viewport checks at 320, 390, 560, 768, 1024, and 1280 CSS pixels: no horizontal document overflow. Visual inspection at narrow and desktop widths. Mobile tabs stack vertically; Up/Down selects projects. Continue and reset work in the narrow layout.
- Mac architecture choice updates the release guidance. Native FAQ expansion works from the keyboard. No release download was triggered during UI testing.
- A script-omitted fixture keeps Studio content readable and script-dependent controls disabled.
- A test-only fixture applies the exact reduced-motion declaration block unconditionally: result animation `none`, button transition `0s`, scrolling `auto`, and Continue focus still works. The shipped stylesheet selects that block using `prefers-reduced-motion: reduce`. OS-level preference emulation and physical mobile devices were not tested.

## Contrast and performance

Sampled text/background pairs pass WCAG AA normal-text contrast: primary CTA 9.14:1, muted dark-page text 7.94–9.39:1, light-section detail 5.49:1, and note signoff 4.84:1. Inactive control borders were brightened; focused/selected states have explicit outlines or borders. Important preview/download explanations are at least 14px.

The complete HTML/CSS/JavaScript/SVG payload is under 50KB uncompressed (about 14KB gzip), with no external fonts, images, framework bundle, or third-party calls. A local instrumented Chrome fixture observed FCP/LCP 128ms, zero layout shift, and zero long tasks. This was an unthrottled local run with cached assets, not a public-network/mobile benchmark, Lighthouse score, or field Core Web Vitals result. Instrumentation and QA fixtures are not included in the public output.

## Release constraints

The v0.2.0 download destination remains private and requires repository access. It is an unsigned, unnotarized developer prerelease. Public installers and Homebrew installation remain separate distribution work. The draft website PR is not merged; deployments use the exact branch commit with per-deployment static-site overrides.
