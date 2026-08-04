import { createHash, randomUUID } from "node:crypto";
import postgres from "postgres";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required.");
const endpoint = (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/$/, "");
const sql = postgres(databaseUrl, { max: 1, prepare: false });
const organizationId = randomUUID(); const projectId = randomUUID();
let connectionId: string | undefined;

try {
  await sql`insert into organization (id, name, slug) values (${organizationId}, 'Machine smoke', ${`machine-smoke-${organizationId}`})`;
  await sql.begin(async (tx) => { await tx`select set_config('app.current_organization_id', ${organizationId}, true)`; await tx`insert into projects (id, organization_id, name, slug) values (${projectId}::uuid, ${organizationId}::uuid, 'Machine API', 'machine-api')`; });
  const start = await fetch(`${endpoint}/api/v1/machines/authorize/start`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ deviceName: "Smoke machine", platform: "linux", clientVersion: "0.2.0", selectedTools: ["codex", "claude_code"] }) });
  const started = await start.json() as { deviceCode?: string; userCode?: string };
  if (!start.ok || !started.deviceCode || !started.userCode) throw new Error(`Authorization start failed: HTTP ${start.status}`);
  const pending = await fetch(`${endpoint}/api/v1/machines/authorize/token`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ deviceCode: started.deviceCode }) });
  if (pending.status !== 428) throw new Error(`Pending authorization returned HTTP ${pending.status}`);
  const userCodeHash = createHash("sha256").update(started.userCode).digest("hex");
  await sql`update machine_device_authorizations set organization_id = ${organizationId}::uuid, project_id = ${projectId}::uuid, approved_by = 'smoke-user', approved_at = now() where user_code_hash = ${userCodeHash}`;
  const pair = await fetch(`${endpoint}/api/v1/machines/authorize/token`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ deviceCode: started.deviceCode }) });
  const paired = await pair.json() as { agentToken?: string; connectionId?: string };
  if (!pair.ok || !paired.agentToken || !paired.connectionId) throw new Error(`Authorization token failed: HTTP ${pair.status}`);
  connectionId = paired.connectionId; const authorization = { authorization: `Bearer ${paired.agentToken}`, "content-type": "application/json" };
  const replay = await fetch(`${endpoint}/api/v1/machines/authorize/token`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ deviceCode: started.deviceCode }) });
  if (replay.status !== 410) throw new Error(`Authorization replay was not rejected: HTTP ${replay.status}`);
  const heartbeat = await fetch(`${endpoint}/api/v1/machines/heartbeat`, { method: "POST", headers: authorization, body: JSON.stringify({ selectedTools: ["codex", "claude_code"], collectorPort: 4318 }) });
  if (!heartbeat.ok) throw new Error(`Heartbeat failed: HTTP ${heartbeat.status}`);
  const hostile = await fetch(`${endpoint}/api/v1/machine-activity`, { method: "POST", headers: authorization, body: JSON.stringify({ events: [{ id: "hostile", timestamp: new Date().toISOString(), tool: "codex", eventType: "completed", prompt: "must be rejected" }] }) });
  if (hostile.status !== 400) throw new Error(`Hostile activity was not rejected: HTTP ${hostile.status}`);
  const activity = await fetch(`${endpoint}/api/v1/machine-activity`, { method: "POST", headers: authorization, body: JSON.stringify({ events: [{ id: "activity-1", timestamp: new Date().toISOString(), tool: "codex", eventType: "agent-turn-complete", status: "success", durationMs: 40 }] }) });
  if (!activity.ok) throw new Error(`Activity failed: HTTP ${activity.status}`);
  const usage = await fetch(`${endpoint}/api/v1/machine-usage`, { method: "POST", headers: authorization, body: JSON.stringify({ events: [{ id: "usage-1", timestamp: new Date().toISOString(), provider: "anthropic", model: "claude-smoke", operation: "generation", usage: { inputTokens: 5 }, dimensions: { environment: "machine", feature: "claude-code" } }] }) });
  if (!usage.ok) throw new Error(`Exact usage failed: HTTP ${usage.status}`);
  const counts = await sql.begin(async (tx) => { await tx`select set_config('app.current_organization_id', ${organizationId}, true)`; const activityRows = await tx<{ count: number }[]>`select count(*)::int as count from agent_activity_events where project_id = ${projectId}::uuid`; const usageRows = await tx<{ count: number; tokens: number }[]>`select count(*)::int as count, coalesce(sum(input_tokens), 0)::int as tokens from usage_events where project_id = ${projectId}::uuid`; return { activity: activityRows[0], usage: usageRows[0] }; });
  if (counts.activity.count !== 1 || counts.usage.count !== 1 || counts.usage.tokens !== 5) throw new Error("Usage and activity separation failed.");
  const disconnect = await fetch(`${endpoint}/api/v1/machines/heartbeat`, { method: "DELETE", headers: { authorization: authorization.authorization } });
  if (!disconnect.ok) throw new Error(`Revocation failed: HTTP ${disconnect.status}`);
  const revoked = await fetch(`${endpoint}/api/v1/machines/heartbeat`, { method: "POST", headers: authorization, body: "{}" });
  if (revoked.status !== 401) throw new Error(`Revoked credential remained active: HTTP ${revoked.status}`);
  console.log("Tokly machine API smoke test passed: browser authorization, replay rejection, heartbeat, usage/activity separation, and revocation.");
} finally {
  await sql.begin(async (tx) => { await tx`select set_config('app.current_organization_id', ${organizationId}, true)`; await tx`delete from agent_activity_events where organization_id = ${organizationId}::uuid`; await tx`delete from usage_events where organization_id = ${organizationId}::uuid`; await tx`delete from hourly_usage where organization_id = ${organizationId}::uuid`; await tx`delete from projects where organization_id = ${organizationId}::uuid`; });
  if (connectionId) await sql`delete from rate_limit_buckets where api_key_id = ${connectionId}::uuid`;
  await sql`delete from machine_connections where organization_id = ${organizationId}::uuid`; await sql`delete from machine_device_authorizations where organization_id = ${organizationId}::uuid`; await sql`delete from machine_pairing_codes where organization_id = ${organizationId}::uuid`; await sql`delete from organization where id = ${organizationId}`; await sql.end();
}
