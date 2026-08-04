import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { setTenant } from "@/lib/db/tenant";
import { agentActivityEvents, machineConnections } from "@/lib/db/schema";
import { authenticateMachine } from "@/lib/machines/auth";
import { activityBatchSchema } from "@/lib/machines/schema";
import { readMachineBearerToken } from "@/lib/security/api-keys";
import { consumeRateLimit } from "@/lib/usage/ingest";

export async function POST(request: Request) {
  const rawKey = readMachineBearerToken(request);
  const machine = rawKey ? await authenticateMachine(rawKey) : null;
  if (!machine) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const parsed = activityBatchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid activity batch." }, { status: 400 });
  if (!(await consumeRateLimit(machine.id, parsed.data.events.length))) return NextResponse.json({ error: "Rate limit exceeded." }, { status: 429 });
  const accepted = await getDb().transaction(async (tx) => {
    await setTenant(tx, machine.organizationId);
    let count = 0;
    for (const event of parsed.data.events) {
      const inserted = await tx.insert(agentActivityEvents).values({
        organizationId: machine.organizationId, projectId: machine.projectId, connectionId: machine.id,
        eventId: event.id, occurredAt: new Date(event.timestamp), tool: event.tool, eventType: event.eventType,
        model: event.model, status: event.status, durationMs: event.durationMs, sessionId: event.sessionId,
      }).onConflictDoNothing().returning({ id: agentActivityEvents.id });
      count += inserted.length;
    }
    return count;
  });
  await getDb().update(machineConnections).set({ lastSeenAt: new Date() }).where(eq(machineConnections.id, machine.id));
  return NextResponse.json({ accepted, duplicates: parsed.data.events.length - accepted });
}
