import "server-only";

import { and, eq, isNull } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { machineConnections } from "@/lib/db/schema";
import { hashProjectKey, projectKeyMatches } from "@/lib/security/api-keys";

export async function authenticateMachine(rawKey: string) {
  const hash = hashProjectKey(rawKey);
  const rows = await getDb().select().from(machineConnections)
    .where(and(eq(machineConnections.credentialHash, hash), isNull(machineConnections.revokedAt))).limit(1);
  const machine = rows[0];
  return machine && projectKeyMatches(rawKey, machine.credentialHash) ? machine : null;
}
