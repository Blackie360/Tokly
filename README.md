# Tokly

Tokly is a standalone, multi-tenant Next.js application for monitoring provider-neutral AI token usage. Teams send operational usage events through a REST endpoint or the server-only TypeScript SDK, then inspect tokens, reported or calculated cost, models, projects, environments, budgets, and ingestion health.

It is intentionally not an AI proxy. It never requests provider API keys and its strict ingestion schema rejects prompts, completions, files, and arbitrary metadata.

## Stack

- Next.js App Router, TypeScript, Server Components, and Server Actions
- PostgreSQL, Drizzle ORM, migrations, and forced row-level security
- Better Auth email/password, optional GitHub OAuth, and organizations
- Recharts, IBM Plex Sans/Mono, CSS Modules, light/dark themes
- Resend for optional threshold email delivery
- Vitest and Playwright

## Local setup

Requirements: Node.js 22+, npm, and PostgreSQL 15+.

```bash
cp .env.example .env.local
docker compose up -d postgres
npm install
npm run db:migrate
npm run db:seed
npm run dev
```

Open `http://localhost:3000`. The `/demo` route is database-free. For the real flow, create an account, workspace, and project; copy the write key when it is revealed. The seed script creates telemetry fixtures and prints a local-only test key, but it does not create a password account.

Generate a production auth secret with `openssl rand -base64 32`. Set `BETTER_AUTH_URL` and `NEXT_PUBLIC_APP_URL` to the canonical HTTPS origin in production. GitHub, Google, and Resend variables are optional.

## Ingest usage

`POST /api/v1/events` accepts a JSON object containing 1–100 events. A batch is validated before a transaction starts, so one invalid event rejects the whole batch. Retries are safe: `(project_id, event_id)` is unique and the response reports accepted and duplicate counts.

```bash
curl -X POST http://localhost:3000/api/v1/events \
  -H "Authorization: Bearer tok_test_REPLACE_ME" \
  -H "Content-Type: application/json" \
  -d '{
    "events": [{
      "id": "request_01J5T7R6M4",
      "timestamp": "2026-08-04T10:00:00.000Z",
      "provider": "openai",
      "model": "your-model-id",
      "operation": "generation",
      "usage": { "inputTokens": 1200, "outputTokens": 240, "cacheReadTokens": 400 },
      "costUsd": "0.0042",
      "latencyMs": 842,
      "status": "success",
      "dimensions": { "environment": "production", "feature": "support-copilot", "traceId": "trace_01" }
    }]
  }'
```

Success returns `{"accepted":1,"duplicates":0}`. Write keys are 32 random bytes with a `tok_live_` or `tok_test_` prefix. The raw value is cleared after the one-time reveal; only its visible prefix and SHA-256 digest are stored.

Request controls include a 256 KiB body limit, strict allowlisted fields, bounded strings, non-negative safe-integer tokens, revoked-key checks, and an atomic PostgreSQL per-key event limit configured by `INGEST_EVENTS_PER_MINUTE`.

## TypeScript SDK

Tokly is SDK-first. Install the server-only package in each application that should report exact AI usage and business context. Never instantiate it in browser code.

```bash
npm install tokly-sdk
```

```ts
import { createTokly } from "tokly-sdk";
import { fromOpenAIResponse } from "tokly-sdk/adapters";

const meter = createTokly({
  apiKey: process.env.TOKLY_API_KEY!,
  endpoint: process.env.TOKLY_URL, // optional; defaults to https://tokly.blackielabs.com
});

meter.capture(fromOpenAIResponse({
  model: response.model,
  usage: response.usage,
  dimensions: { environment: "production", feature: "support-copilot" },
}));

await meter.shutdown(); // flush during a graceful process shutdown
```

Adapters are included for the Vercel AI SDK, OpenAI Responses, Anthropic Messages, Google Gemini, OpenRouter, and Ollama response shapes. OpenRouter events retain provider-reported cost, cache, and reasoning usage. Ollama events track local token usage and latency without inventing a dollar cost. `capture()` buffers up to 100 events per request; `flush()` retries transient failures and `429` responses with exponential backoff while rejecting permanent client errors immediately.

The SDK is the primary integration and does not monitor or change a developer workstation. Source for the separate, optional `tokly-cli` connector lives in [`packages/cli`](./packages/cli), but its first npm release is still pending. Do not advertise an install command until the package is available from the registry.

Once released, the CLI will report only the telemetry each tool exposes. Claude Code and Gemini CLI provide exact token metrics; Cursor, Codex, and Ollama provide lifecycle activity only. See [`packages/cli`](./packages/cli/README.md) for its current release status and privacy boundaries.

## Cost and budgets

Provider-reported `costUsd` always wins. Otherwise, Tokly selects the model price active at the event timestamp and prices uncached input, output, cache reads, and cache writes independently. Unknown models remain explicitly `unpriced`; the application never invents a rate.

The dashboard exposes pricing coverage, sampled average latency, and per-event cost provenance so operators can distinguish provider-reported, calculated, and unpriced activity. Budget threshold crossings remain visible in the in-app alert history even when optional email delivery is not configured.

Maintain the `model_prices` table with verified provider source URLs and non-overlapping effective windows. Close the old row with `effective_to`, insert a new row with `effective_from`, and never rewrite historical prices. See [operations](./docs/operations.md).

Organization and project monthly budgets create unique in-app notifications at 50%, 80%, and 100%. Resend delivery is idempotent through a unique notification-recipient outbox; budgets alert but never block or downgrade requests.

## Validation

```bash
npm run lint
npm run typecheck
npm test
npm run build
npm run test:e2e
```

PostgreSQL integration tests require a migrated disposable database:

```bash
TEST_DATABASE_URL=postgresql://tokly_app:tokly@localhost:5433/tokly npm run test:integration
```

The integration suite writes isolated UUID fixtures and removes only those fixtures. The database-backed Playwright onboarding suite requires a migrated disposable database and is opt-in with `E2E_DATABASE_URL`; it covers account creation, workspace/project setup, one-time key reveal, ingestion, dashboard updates, explorer filters/charts, budgets, and invitations. The database-free desktop/mobile demo tests always run.

See [architecture](./docs/architecture.md) for the trust boundaries, [deployment](./docs/deployment.md) for GitHub Actions and Vercel setup, and [operations](./docs/operations.md) for retention and incident-safe key rotation.
