# Deployment

Tokly uses three GitHub Actions workflows:

- `CI` validates pull requests and pushes to `main`.
- `Deploy production` builds and deploys the web application to Vercel after every push to `main`.
- `Publish SDK` publishes the `@blackie360/tokly` npm package from GitHub releases tagged `sdk-v<version>`.

## Vercel production setup

Create or import the `Blackie360/Tokly` repository as a Vercel project and configure `tokly.blackielabs.com` as its production domain. Add these GitHub Actions secrets in the repository settings:

| Secret | Source |
| --- | --- |
| `VERCEL_TOKEN` | A scoped Vercel account or team token |
| `VERCEL_ORG_ID` | `orgId` in `.vercel/project.json` after `vercel link` |
| `VERCEL_PROJECT_ID` | `projectId` in `.vercel/project.json` after `vercel link` |

After adding the secrets, create the repository variable `ENABLE_VERCEL_DEPLOYMENTS` with the value `true`. Pushes to `main` are safely skipped until this variable exists; a deliberate manual workflow dispatch can still be used for setup testing.

Set the application variables from `.env.example` in the Vercel production environment. At minimum, production needs the canonical URLs, a strong Better Auth secret, and a production PostgreSQL connection. Never store these values in GitHub workflow files.

The deployment workflow pins Vercel CLI `58.5.1`, pulls the production environment, builds once with `vercel build --prod`, and deploys that exact artifact with `vercel deploy --prebuilt --prod`.

## npm trusted publishing

Open the `@blackie360/tokly` package settings on npm and add a GitHub Actions trusted publisher with:

- Organization or user: `Blackie360`
- Repository: `Tokly`
- Workflow filename: `publish-sdk.yml`
- Environment: leave blank

Trusted publishing uses GitHub OIDC, so the workflow does not store an npm token. Its `id-token: write` permission is required.

For a release:

1. Update `packages/sdk/package.json` to the intended version and commit it.
2. Push the commit to `main` and wait for CI to pass.
3. Create a GitHub release tagged `sdk-v<version>`, such as `sdk-v0.2.0`.
4. The workflow verifies that the tag and package versions match before publishing.

## Rollback

Use Vercel's deployment history to promote the last known-good production deployment. npm versions are immutable; fix an SDK regression by publishing a new patch version and deprecating the affected version rather than replacing it.
