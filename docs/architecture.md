# Architecture and security model

## Request paths

- Dashboard reads are authenticated Server Components.
- Dashboard mutations are Server Actions that re-check workspace membership and owner/admin permissions.
- Better Auth is exposed at `/api/auth/[...all]`.
- External telemetry is exposed only at `POST /api/v1/events`.
- The SDK and write keys are server-only. Browser clients must send usage through their own backend.

## Tenant isolation

Better Auth owns users, sessions, organizations, memberships, and invitations. Custom tenant tables carry `organization_id`. Every dashboard or ingestion transaction calls `set_config('app.current_organization_id', ..., true)` before reading or writing tenant data.

PostgreSQL policies enforce the same organization identifier on `projects`, `usage_events`, `hourly_usage`, `budgets`, `notifications`, and `alert_deliveries`. Migrations enable and force RLS so the application table owner cannot accidentally bypass it. The API-key lookup table is the deliberate exception: the tenant is unknown until a high-entropy key digest is resolved, and every lookup filters by the SHA-256 digest plus revocation state.

## Ingestion transaction

The handler authenticates the Bearer key, enforces byte limits, parses the strict schema, and consumes a per-minute key bucket. One database transaction then inserts immutable raw events, ignores duplicate `(project_id, event_id)` records, updates dimensional hourly rollups only for newly inserted records, and creates idempotent budget notifications. Email is delivered from the outbox after the response lifecycle begins.

No prompt, completion, message, file, tool arguments, provider credential, or arbitrary JSON metadata column exists in the event store.
