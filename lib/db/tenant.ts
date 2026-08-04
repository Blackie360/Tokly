import "server-only";

import { sql } from "drizzle-orm";
import { getDb, type Database } from "./index";

type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

export async function withTenant<T>(
  organizationId: string,
  callback: (tx: Transaction) => Promise<T>,
): Promise<T> {
  return getDb().transaction(async (tx) => {
    await tx.execute(
      sql`select set_config('app.current_organization_id', ${organizationId}, true)`,
    );
    return callback(tx);
  });
}

export async function setTenant(tx: Transaction, organizationId: string) {
  await tx.execute(
    sql`select set_config('app.current_organization_id', ${organizationId}, true)`,
  );
}
