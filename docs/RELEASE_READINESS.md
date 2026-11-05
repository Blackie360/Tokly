# Mac distribution readiness

Current development builds are unsigned for distribution. Do not describe them as trusted clean-install releases.

Read-only checks on 5 November 2026 found:

- No valid code-signing identities on the development Mac.
- The local ARM build has a linker ad-hoc signature, no TeamIdentifier and no sealed bundle resources. Gatekeeper assessment fails.
- The existing CI workflow explicitly builds with `--no-sign`; no repository-level signing secrets were listed. Environment/organization credentials were not independently verified.
- The repository is private. The v0.2.0 prerelease has ARM and Intel ZIP assets, but an unauthenticated request for the ARM download returns HTTP 404.

A clean-install trust test remains blocked until a Developer ID Application signing identity and an authorized notarization authentication method are available, and a public distribution destination is approved. Do not request passwords in chat, invent credentials, change repository visibility or weaken Gatekeeper to work around these gates.

When those prerequisites are available, build and sign the final approved commit with hardened runtime, submit it through Apple's notarization flow, verify success and staple the ticket. Test the downloadable artifact on a separate clean Mac or disposable test environment without developer credentials, including first launch, folder selection, relaunch, notes, editor detection, sleep/wake and optional login startup. Verify both Intel and Apple Silicon artifacts and anonymous download checksums. A successful launch on the development Mac is not evidence of a clean-install trust pass.

The intended distribution routes are `tokly.blackielabs.com` and Homebrew, while the source repository stays private. Website hosting access currently needs an authorized connection (the existing Vercel connector reported HTTP 403). The website, DNS, repository visibility and public-sharing configuration have not been changed. A Homebrew cask needs an accessible, immutable signed/notarized artifact URL and SHA-256; a private GitHub release URL cannot serve anonymous installs. The installed notarization tool is available, but no signing/notarization environment-variable names were present; keychain credential profiles were not enumerated or exposed.
