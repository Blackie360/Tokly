import { readdir } from "node:fs/promises";
import { resolve } from "node:path";
import nextEnv from "@next/env";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

nextEnv.loadEnvConfig(process.cwd());

const migrationsFolder = resolve(process.cwd(), "drizzle");
const checkOnly = process.argv.includes("--check");
const connectionString = process.env.NEON_MIGRATION_DATABASE_URL;

if (!connectionString) {
  throw new Error("NEON_MIGRATION_DATABASE_URL is required. Keep it in .env.local or the deployment environment, never in Git.");
}

const target = new URL(connectionString);
if (!/^postgres(ql)?:$/.test(target.protocol)) throw new Error("NEON_MIGRATION_DATABASE_URL must be a PostgreSQL connection string.");
if (!target.hostname.endsWith(".neon.tech")) throw new Error("NEON_MIGRATION_DATABASE_URL must target a Neon database.");
if (target.hostname.includes("-pooler.")) throw new Error("Use Neon's direct connection for migrations, not a -pooler endpoint.");
if (target.searchParams.get("sslmode") !== "require") throw new Error("NEON_MIGRATION_DATABASE_URL must include sslmode=require.");

const migrationFiles = (await readdir(migrationsFolder)).filter((name) => /^\d+_.+\.sql$/.test(name)).sort();
if (migrationFiles.length === 0) throw new Error("No SQL migrations were found in the drizzle directory.");

if (checkOnly) {
  console.info(`Neon migration configuration is valid. ${migrationFiles.length} migration file(s) are ready.`);
  process.exit(0);
}

const client = postgres(connectionString, { max: 1, prepare: false });
const db = drizzle(client);

try {
  await migrate(db, { migrationsFolder });
  console.info("Neon database migrations applied successfully.");
} finally {
  await client.end();
}
