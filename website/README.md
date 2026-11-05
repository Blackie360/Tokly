# Tokly website

Static marketing and download website for the local-first Tokly desktop app. All website source and deployment files live in this directory; the desktop app at the repository root is unchanged.

## Validate

Run `node website/verify.mjs` from the repository root, or `npm test` inside `website/`. There are no website dependencies or installation steps.

The publishable output is `website/public/`. Serve that directory with any static server to preview it.

## Vercel

Use the existing `tokly` project in the authorized Vercel team. Set its **Root Directory** to `website`; use Framework **Other**, the included build command `node verify.mjs`, and Output Directory `public`. Do not point the project at the repository root or publish desktop source files.

The intended production hostname is `tokly.blackielabs.com`. Keep the existing domain and account unchanged. Confirm the Git repository and production branch in Vercel before deployment. Deployment requires access to the existing project; do not work around a team-access error with another account or hostname.

## Downloads

The current page links to the verified v0.2.0 prerelease in the private application repository and explicitly says access is required. Replace those destinations only after public release artifacts have been approved, published, and verified. Do not make the source repository public to enable downloads. The unsigned, unnotarized developer-build warning must remain until the actual release changes.

Homebrew distribution is planned separately. Do not advertise an installation command until its public tap and architecture-specific artifact URLs and checksums have been validated.

## Interactions and checks

- Accessible project tabs with arrow keys, Home, and End.
- Temporary sample pin state, with no browser persistence or network requests.
- Mac architecture selection with matching download guidance.
- Native expandable FAQs.
- Responsive layouts and reduced-motion support.
- Explicitly illustrative projects and commits, not live workspace access.

The page was visually reviewed in a browser at desktop and narrow widths, including 320, 390, and 768 px containers, with no horizontal overflow. Project changes, keyboard tab navigation, pinning, architecture selection, and FAQs were tested. Any changes to release destinations require renewed link checks.
