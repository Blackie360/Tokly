import { and, eq, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { setTenant } from "@/lib/db/tenant";
import { machineConnections, machinePairingCodes, projects } from "@/lib/db/schema";
import { pairMachineSchema } from "@/lib/machines/schema";
import { generateMachineCredential, hashProjectKey } from "@/lib/security/api-keys";

export async function POST(request: Request) {
  const parsed = pairMachineSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid pairing request." }, { status: 400 });
  const now = new Date();
  const codeHash = hashProjectKey(parsed.data.code.toUpperCase());
  const credential = generateMachineCredential();
  const result = await getDb().transaction(async (tx) => {
    const rows = await tx.select().from(machinePairingCodes)
      .where(and(eq(machinePairingCodes.codeHash, codeHash), isNull(machinePairingCodes.consumedAt))).limit(1);
    const pairing = rows[0];
    if (!pairing || pairing.expiresAt <= now) return null;
    const consumed = await tx.update(machinePairingCodes).set({ consumedAt: now })
      .where(and(eq(machinePairingCodes.id, pairing.id), isNull(machinePairingCodes.consumedAt))).returning({ id: machinePairingCodes.id });
    if (!consumed[0]) return null;
    await setTenant(tx, pairing.organizationId);
    const project = await tx.select({ name: projects.name }).from(projects).where(eq(projects.id, pairing.projectId)).limit(1);
    const connection = await tx.insert(machineConnections).values({
      organizationId: pairing.organizationId,
      projectId: pairing.projectId,
      name: parsed.data.deviceName,
      platform: parsed.data.platform,
      credentialPrefix: credential.prefix,
      credentialHash: credential.hash,
      selectedTools: parsed.data.selectedTools,
      clientVersion: parsed.data.clientVersion,
      lastSeenAt: now,
    }).returning({ id: machineConnections.id });
    return { connectionId: connection[0].id, projectId: pairing.projectId, projectName: project[0]?.name ?? "Tokly project" };
  });
  if (!result) return NextResponse.json({ error: "Pairing code is invalid, expired, or already used." }, { status: 410 });
  return NextResponse.json({ ...result, agentToken: credential.rawKey }, { headers: { "Cache-Control": "no-store" } });
}
