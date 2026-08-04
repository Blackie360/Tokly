import { loadEnvConfig } from "@next/env";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../lib/db/schema";
import {
  budgets,
  hourlyUsage,
  member,
  organization,
  projectApiKeys,
  projects,
  usageEvents,
  user,
} from "../lib/db/schema";
import { hashProjectKey } from "../lib/security/api-keys";

loadEnvConfig(process.cwd());

const organizationId = "1d144b7c-4ebd-468a-b36b-b66f80fef933";
const projectId = "0cd791e0-6e02-48ac-a9cf-7e601961f7a1";
const userId = "24e49f09-4498-48d8-815b-fae8aad463d2";
const apiKeyId = "d3446318-791e-4d80-92b8-1a272676a1e8";
const budgetId = "3db42980-b3ab-4436-a797-5bb4480c1876";
const seedKey = `tok_test_${Buffer.alloc(32, 7).toString("base64url")}`;
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required to seed the database.");
const client = postgres(databaseUrl, { max: 1, prepare: false });
const db = drizzle(client, { schema });

function hourOffset(hoursAgo: number) {
  const date = new Date();
  date.setUTCMinutes(0, 0, 0);
  date.setUTCHours(date.getUTCHours() - hoursAgo);
  return date;
}

async function seed() {
  await db
    .insert(user)
    .values({ id: userId, name: "Seed Operator", email: "seed@tokly.local", emailVerified: true })
    .onConflictDoUpdate({ target: user.id, set: { name: "Seed Operator" } });
  await db
    .insert(organization)
    .values({ id: organizationId, name: "Northstar Systems", slug: "northstar-seed" })
    .onConflictDoUpdate({ target: organization.id, set: { name: "Northstar Systems" } });
  await db
    .insert(member)
    .values({ id: "fe479a47-9cb7-4edf-b47d-610099871a11", organizationId, userId, role: "owner" })
    .onConflictDoNothing();

  await db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.current_organization_id', ${organizationId}, true)`);
    await tx
      .insert(projects)
      .values({ id: projectId, organizationId, name: "Production API", slug: "production-api" })
      .onConflictDoUpdate({ target: projects.id, set: { name: "Production API" } });
    await tx
      .insert(budgets)
      .values({
        id: budgetId,
        organizationId,
        name: "Platform monthly",
        scope: "organization",
        monthlyLimitUsd: "250.00",
        alertEmail: "seed@tokly.local",
      })
      .onConflictDoUpdate({ target: budgets.id, set: { monthlyLimitUsd: "250.00" } });

    const fixtureRows = [
      { hoursAgo: 1, provider: "openai" as const, model: "example-chat-large", input: 18_400, output: 5_300, cache: 3_100, cost: "0.6800000000" },
      { hoursAgo: 5, provider: "anthropic" as const, model: "example-reasoning", input: 11_200, output: 7_800, cache: 1_700, cost: "0.9100000000" },
      { hoursAgo: 14, provider: "google" as const, model: "example-fast", input: 25_100, output: 2_900, cache: 8_400, cost: "0.2400000000" },
    ];

    for (const [index, fixture] of fixtureRows.entries()) {
      const occurredAt = hourOffset(fixture.hoursAgo);
      await tx
        .insert(usageEvents)
        .values({
          organizationId,
          projectId,
          eventId: `seed-event-${index + 1}`,
          occurredAt,
          provider: fixture.provider,
          model: fixture.model,
          operation: "generation",
          inputTokens: fixture.input,
          outputTokens: fixture.output,
          cacheReadTokens: fixture.cache,
          costUsd: fixture.cost,
          costSource: "reported",
          environment: "test",
          feature: "seed-fixture",
        })
        .onConflictDoNothing();
      await tx
        .insert(hourlyUsage)
        .values({
          organizationId,
          projectId,
          hour: occurredAt,
          provider: fixture.provider,
          model: fixture.model,
          operation: "generation",
          environment: "test",
          feature: "seed-fixture",
          requestCount: 1,
          inputTokens: fixture.input,
          outputTokens: fixture.output,
          cacheReadTokens: fixture.cache,
          costUsd: fixture.cost,
        })
        .onConflictDoNothing();
    }
  });

  await db
    .insert(projectApiKeys)
    .values({
      id: apiKeyId,
      organizationId,
      projectId,
      name: "Seed test key",
      environment: "test",
      keyPrefix: seedKey.slice(0, 17),
      keyHash: hashProjectKey(seedKey),
    })
    .onConflictDoUpdate({ target: projectApiKeys.id, set: { revokedAt: null } });

  console.info(`Seeded Northstar Systems. Local test key (fixture only): ${seedKey}`);
  console.info("Sign up through the application to exercise the complete authenticated onboarding flow.");
}

seed()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await client.end();
  });
