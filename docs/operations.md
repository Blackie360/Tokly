# Operations

## Deployment

Provision PostgreSQL, set the variables in `.env.example`, run `npm run db:migrate` as a release step, and deploy the Next.js Node runtime behind HTTPS. Use separate database roles for migrations and the application in hardened environments; the application role needs normal DML access and must remain subject to the forced RLS policies.

Set `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `NEXT_PUBLIC_APP_URL`, and `DATABASE_URL`. Add GitHub OAuth only after its callback URL is configured. Add `RESEND_API_KEY` and a verified `ALERT_FROM_EMAIL` to enable email; in-app notifications work without Resend. Never log Authorization headers or raw project keys at the reverse proxy.

After deployment, send a test event, retry the same event ID, verify `accepted: 0, duplicates: 1`, inspect the dashboard rollup, revoke the test key, and confirm it receives HTTP 401.

## Price maintenance

Use only rates verified against a provider's official pricing page. Each row records the exact provider model identifier, component rates per million tokens, an effective start, optional exclusive effective end, and the source URL. To change a rate in one transaction:

1. Set the active row's `effective_to` to the new rate's activation timestamp.
2. Insert the replacement row with that timestamp as `effective_from`.
3. Test an event immediately before and at the boundary.
4. Leave unknown models unpriced until a verified source is available.

Provider-reported cost remains authoritative and is stored with `cost_source = reported`.

## Retention

The recommended default is 90 days for immutable raw events and 730 days for hourly rollups. Membership, projects, budgets, notifications, and audit-relevant key metadata are retained until the organization is deleted. Change the windows through `RAW_EVENT_RETENTION_DAYS` and `ROLLUP_RETENTION_DAYS` according to the customer contract and applicable law.

`npm run db:retention` is dry-run by default and reports exact row counts. Schedule it daily only after reviewing the output, then set `RETENTION_CONFIRMED=true` in the scheduled job. Deletion executes one RLS-scoped organization transaction at a time.

## Incident-safe key rotation

1. Create an overlapping write key for the same project and environment.
2. Copy it during the one-time reveal and deploy it to the producing service's secret manager.
3. Confirm the new prefix shows recent ingestion.
4. Revoke the old prefix from the projects screen.
5. Retry the old key and confirm HTTP 401; do not retry a request if database state is uncertain without first checking ingestion by event ID.

Rotation never changes provider credentials because Tokly does not collect them. A database leak reveals key prefixes and SHA-256 digests, not raw keys.
