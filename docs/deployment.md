# Deployment

Tokly uses three GitHub Actions workflows:

- `CI` validates pull requests and pushes to `main`.
- `Publish SDK` publishes a new `tokly-sdk` version after it reaches `main`.
- `Publish optional machine CLI` publishes `tokly-cli` only when manually dispatched.

## Vercel web deployments

The `Blackie360/Tokly` repository is connected directly to the existing `blackhat360gamers-projects/tokly` Vercel project. Vercel owns web deployment automation:

- Pushes to `main` create production deployments.
- Pull requests create preview deployments.
- `tokly.blackielabs.com` is the production domain.
- Deployment history in Vercel provides rollback and promotion controls.

No `VERCEL_TOKEN`, `VERCEL_ORG_ID`, or `VERCEL_PROJECT_ID` GitHub secrets are required. Keeping deployment inside Vercel avoids duplicate production builds and long-lived Vercel credentials in GitHub.

Set the application variables from `.env.example` in the Vercel production environment. At minimum, production needs the canonical URLs, a strong Better Auth secret, and a production PostgreSQL connection. Never store these values in GitHub workflow files.

## npm trusted publishing

Open the `tokly-sdk` package settings on npm and add a GitHub Actions trusted publisher with:

- Organization or user: `Blackie360`
- Repository: `Tokly`
- Workflow filename: `publish-sdk.yml`
- Environment: leave blank

Trusted publishing uses GitHub OIDC, so the workflow does not store an npm token. Its `id-token: write` permission is required.

For a release:

1. Update `packages/sdk/package.json` and `packages/sdk/src/version.ts` to the intended version and commit them.
2. Push the commit to `main` and wait for CI to pass.
3. The workflow checks npm and publishes only when that version does not already exist.

The optional `tokly-cli` package has its own version in `packages/cli/package.json` and `packages/cli/src/version.ts`. Configure `publish-cli.yml` as its trusted publisher, then manually dispatch `Publish optional machine CLI` when a reviewed CLI version is ready. Keeping this separate prevents an SDK release from silently changing workstation configuration behavior.

## Rollback

Use Vercel's deployment history to promote the last known-good production deployment. npm versions are immutable; fix an SDK regression by publishing a new patch version and deprecating the affected version rather than replacing it.
