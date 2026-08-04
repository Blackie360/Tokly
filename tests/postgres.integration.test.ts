import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const databaseUrl = process.env.TEST_DATABASE_URL;
const integration = describe.skipIf(!databaseUrl);
let client: ReturnType<typeof postgres>;
const organizationA = randomUUID();
const organizationB = randomUUID();
const projectA = randomUUID();

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
});
