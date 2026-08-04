import "server-only";

import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export type Database = PostgresJsDatabase<typeof schema>;

let client: ReturnType<typeof postgres> | undefined;
let database: Database | undefined;

export function hasDatabase() {
  return Boolean(process.env.DATABASE_URL);
}

export function getDb(): Database {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required for this operation.");
  }

  if (!client) {
    client = postgres(process.env.DATABASE_URL, {
      max: process.env.NODE_ENV === "production" ? 10 : 3,
      prepare: false,
      idle_timeout: 20,
    });
    database = drizzle(client, { schema });
  }

  return database!;
}
