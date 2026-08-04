import { loadEnvConfig } from "@next/env";
import postgres from "postgres";

loadEnvConfig(process.cwd());
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required to apply retention.");

const rawDays = Number(process.env.RAW_EVENT_RETENTION_DAYS ?? 90);
const rollupDays = Number(process.env.ROLLUP_RETENTION_DAYS ?? 730);
if (!Number.isInteger(rawDays) || rawDays < 1 || !Number.isInteger(rollupDays) || rollupDays < rawDays) {
  throw new Error("Retention days must be positive integers and rollup retention must not be shorter than raw retention.");
}

const confirmed = process.env.RETENTION_CONFIRMED === "true";
const client = postgres(databaseUrl, { max: 1, prepare: false });
const rawCutoff = new Date(Date.now() - rawDays * 86_400_000);
const rollupCutoff = new Date(Date.now() - rollupDays * 86_400_000);

async function applyRetention() {
  const organizations = await client<{ id: string }[]>`select id from organization order by id`;
  let rawRows = 0;
  let rollupRows = 0;

  for (const organization of organizations) {
    await client.begin(async (tx) => {
      await tx`select set_config('app.current_organization_id', ${organization.id}, true)`;
      if (confirmed) {
        const deletedEvents = await tx<{ id: string }[]>`
          delete from usage_events
          where organization_id = ${organization.id}::uuid and received_at < ${rawCutoff}
          returning id
        `;
        const deletedRollups = await tx<{ project_id: string }[]>`
          delete from hourly_usage
          where organization_id = ${organization.id}::uuid and hour < ${rollupCutoff}
          returning project_id
        `;
        rawRows += deletedEvents.length;
        rollupRows += deletedRollups.length;
      } else {
        const [eventCount] = await tx<{ count: string }[]>`
          select count(*)::text as count from usage_events
          where organization_id = ${organization.id}::uuid and received_at < ${rawCutoff}
        `;
        const [rollupCount] = await tx<{ count: string }[]>`
          select count(*)::text as count from hourly_usage
          where organization_id = ${organization.id}::uuid and hour < ${rollupCutoff}
        `;
        rawRows += Number(eventCount?.count ?? 0);
        rollupRows += Number(rollupCount?.count ?? 0);
      }
    });
  }

  console.info(`${confirmed ? "Deleted" : "Would delete"} ${rawRows} raw events older than ${rawDays} days.`);
  console.info(`${confirmed ? "Deleted" : "Would delete"} ${rollupRows} hourly rollups older than ${rollupDays} days.`);
  if (!confirmed) console.info("Set RETENTION_CONFIRMED=true to apply these exact retention windows.");
}

applyRetention()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => client.end());
