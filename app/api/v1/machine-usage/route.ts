import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { machineConnections } from "@/lib/db/schema";
import { authenticateMachine } from "@/lib/machines/auth";
import { machineUsageBatchSchema } from "@/lib/machines/schema";
import { readMachineBearerToken } from "@/lib/security/api-keys";
import { ingestUsageForIdentity } from "@/lib/usage/ingest";

export async function POST(request: Request) {
  const rawKey = readMachineBearerToken(request);
  const machine = rawKey ? await authenticateMachine(rawKey) : null;
  if (!machine) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const parsed = machineUsageBatchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid exact usage batch." }, { status: 400 });
  const result = await ingestUsageForIdentity({ ...machine, environment: "machine" }, parsed.data);
  if (result.status === "rate_limited") return NextResponse.json({ error: "Rate limit exceeded." }, { status: 429 });
  await getDb().update(machineConnections).set({ lastSeenAt: new Date() }).where(eq(machineConnections.id, machine.id));
  return NextResponse.json({ accepted: result.accepted, duplicates: result.duplicates });
}
