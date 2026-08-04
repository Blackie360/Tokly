import { createHash, randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const databaseUrl = process.env.TEST_DATABASE_URL;
const integration = describe.skipIf(!databaseUrl);
let client: ReturnType<typeof postgres>;
const organizationA = randomUUID();
const organizationB = randomUUID();
const projectA = randomUUID();
const machineA = randomUUID();

integration("PostgreSQL tenant and ingestion guarantees", () => {
  beforeAll(async () => {
    client = postgres(databaseUrl!, { max: 1, prepare: false });
    await client`insert into organization (id, name, slug) values (${organizationA}, 'Integration A', ${`integration-a-${organizationA}`})`;
    await client`insert into organization (id, name, slug) values (${organizationB}, 'Integration B', ${`integration-b-${organizationB}`})`;
    await client.begin(async (tx) => {
      await tx`select set_config('app.current_organization_id', ${organizationA}, true)`;
      await tx`insert into projects (id, organization_id, name, slug) values (${projectA}::uuid, ${organizationA}::uuid, 'API', 'api')`;
    });
  });

  afterAll(async () => {
    if (!client) return;
    await client.begin(async (tx) => {
      await tx`select set_config('app.current_organization_id', ${organizationA}, true)`;
      await tx`delete from usage_events where organization_id = ${organizationA}::uuid`;
      await tx`delete from agent_activity_events where organization_id = ${organizationA}::uuid`;
      await tx`delete from machine_connections where organization_id = ${organizationA}::uuid`;
      await tx`delete from machine_device_authorizations where organization_id = ${organizationA}::uuid`;
      await tx`delete from machine_pairing_codes where organization_id = ${organizationA}::uuid`;
      await tx`delete from projects where organization_id = ${organizationA}::uuid`;
    });
    await client`delete from organization where id in (${organizationA}, ${organizationB})`;
    await client.end();
  });

  it("deduplicates SDK retries on project and event id", async () => {
    const inserted = await client.begin(async (tx) => {
      await tx`select set_config('app.current_organization_id', ${organizationA}, true)`;
      return tx<{ id: string }[]>`
        insert into usage_events (
          organization_id, project_id, event_id, occurred_at, provider, model,
          operation, status, cost_source
        ) values (
          ${organizationA}::uuid, ${projectA}::uuid, 'retry-event', now(),
          'openai', 'integration-model', 'generation', 'success', 'unpriced'
        ), (
          ${organizationA}::uuid, ${projectA}::uuid, 'retry-event', now(),
          'openai', 'integration-model', 'generation', 'success', 'unpriced'
        ) on conflict (project_id, event_id) do nothing returning id
      `;
    });
    expect(inserted).toHaveLength(1);
  });

  it("hides tenant rows when a different organization context is active", async () => {
    const rows = await client.begin(async (tx) => {
      await tx`select set_config('app.current_organization_id', ${organizationB}, true)`;
      return tx<{ id: string }[]>`select id from projects where id = ${projectA}::uuid`;
    });
    expect(rows).toHaveLength(0);
  });

  it("deduplicates activity separately and tenant-isolates it", async () => {
    await client`insert into machine_connections (id, organization_id, project_id, name, platform, credential_prefix, credential_hash, client_version) values (${machineA}::uuid, ${organizationA}::uuid, ${projectA}::uuid, 'CI machine', 'linux', 'tok_agent_ci', ${`hash-${machineA}`}, '0.2.0')`;
    const inserted = await client.begin(async (tx) => {
      await tx`select set_config('app.current_organization_id', ${organizationA}, true)`;
      return tx<{ id: string }[]>`insert into agent_activity_events (organization_id, project_id, connection_id, event_id, occurred_at, tool, event_type) values (${organizationA}::uuid, ${projectA}::uuid, ${machineA}::uuid, 'activity-retry', now(), 'codex', 'completed'), (${organizationA}::uuid, ${projectA}::uuid, ${machineA}::uuid, 'activity-retry', now(), 'codex', 'completed') on conflict (project_id, event_id) do nothing returning id`;
    });
    expect(inserted).toHaveLength(1);
    const hidden = await client.begin(async (tx) => { await tx`select set_config('app.current_organization_id', ${organizationB}, true)`; return tx<{ id: string }[]>`select id from agent_activity_events where event_id = 'activity-retry'`; });
    expect(hidden).toHaveLength(0);
  });

  it("stores pairing codes and agent credentials only as hashes", async () => {
    const rawCode = "TLY-TEST-CODE"; const codeHash = createHash("sha256").update(rawCode).digest("hex");
    const pairingId = randomUUID();
    await client`insert into machine_pairing_codes (id, organization_id, project_id, code_hash, created_by, expires_at) values (${pairingId}::uuid, ${organizationA}::uuid, ${projectA}::uuid, ${codeHash}, 'integration-user', now() + interval '10 minutes')`;
    const consumed = await client<{ id: string }[]>`update machine_pairing_codes set consumed_at = now() where id = ${pairingId}::uuid and consumed_at is null and expires_at > now() returning id`;
    const replay = await client<{ id: string }[]>`update machine_pairing_codes set consumed_at = now() where id = ${pairingId}::uuid and consumed_at is null and expires_at > now() returning id`;
    const stored = await client<{ code_hash: string }[]>`select code_hash from machine_pairing_codes where id = ${pairingId}::uuid`;
    expect(consumed).toHaveLength(1); expect(replay).toHaveLength(0); expect(stored[0].code_hash).toBe(codeHash); expect(stored[0].code_hash).not.toContain(rawCode);
  });

  it("stores device authorization secrets as hashes and consumes approval once", async () => {
    const deviceId = randomUUID();
    const rawDeviceCode = "terminal-only-device-secret";
    const rawUserCode = "ABCD-2345";
    const deviceHash = createHash("sha256").update(rawDeviceCode).digest("hex");
    const userHash = createHash("sha256").update(rawUserCode).digest("hex");
    await client`insert into machine_device_authorizations (id, device_code_hash, user_code_hash, device_name, platform, client_version, expires_at, organization_id, project_id, approved_by, approved_at) values (${deviceId}::uuid, ${deviceHash}, ${userHash}, 'CI terminal', 'linux', '0.2.0', now() + interval '10 minutes', ${organizationA}::uuid, ${projectA}::uuid, 'integration-user', now())`;
    const consumed = await client<{ id: string }[]>`update machine_device_authorizations set consumed_at = now() where id = ${deviceId}::uuid and consumed_at is null and approved_at is not null and expires_at > now() returning id`;
    const replay = await client<{ id: string }[]>`update machine_device_authorizations set consumed_at = now() where id = ${deviceId}::uuid and consumed_at is null and approved_at is not null and expires_at > now() returning id`;
    const stored = (await client<{ device_code_hash: string; user_code_hash: string }[]>`select device_code_hash, user_code_hash from machine_device_authorizations where id = ${deviceId}::uuid`)[0];
    expect(consumed).toHaveLength(1);
    expect(replay).toHaveLength(0);
    expect(stored).toEqual({ device_code_hash: deviceHash, user_code_hash: userHash });
    expect(JSON.stringify(stored)).not.toContain(rawDeviceCode);
    expect(JSON.stringify(stored)).not.toContain(rawUserCode);
  });
});
