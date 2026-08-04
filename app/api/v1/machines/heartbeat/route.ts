import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { machineConnections } from "@/lib/db/schema";
import { authenticateMachine } from "@/lib/machines/auth";
import { heartbeatSchema } from "@/lib/machines/schema";
import { readMachineBearerToken } from "@/lib/security/api-keys";

export async function POST(request: Request) {
  const rawKey = readMachineBearerToken(request);
  if (!rawKey) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const machine = await authenticateMachine(rawKey);
  if (!machine) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const parsed = heartbeatSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid heartbeat." }, { status: 400 });
  const now = new Date();
  await getDb().update(machineConnections).set({ lastSeenAt: now, selectedTools: parsed.data.selectedTools ?? machine.selectedTools }).where(eq(machineConnections.id, machine.id));
  return NextResponse.json({ ok: true, connectionId: machine.id, serverTime: now.toISOString() });
}

export async function DELETE(request: Request) {
  const rawKey = readMachineBearerToken(request);
  const machine = rawKey ? await authenticateMachine(rawKey) : null;
  if (!machine) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  await getDb().update(machineConnections).set({ revokedAt: new Date() }).where(eq(machineConnections.id, machine.id));
  return NextResponse.json({ ok: true });
}
