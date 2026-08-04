import { and, eq, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { setTenant } from "@/lib/db/tenant";
import { machineConnections, machineDeviceAuthorizations, projects } from "@/lib/db/schema";
import { pollMachineAuthorizationSchema } from "@/lib/machines/schema";
import { generateMachineCredential, hashProjectKey } from "@/lib/security/api-keys";

export async function POST(request: Request) {
  const parsed = pollMachineAuthorizationSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_request" }, { status: 400 });

  const now = new Date();
  const credential = generateMachineCredential();
  const result = await getDb().transaction(async (tx) => {
    const authorization = (await tx.select().from(machineDeviceAuthorizations)
      .where(and(
        eq(machineDeviceAuthorizations.deviceCodeHash, hashProjectKey(parsed.data.deviceCode)),
        isNull(machineDeviceAuthorizations.consumedAt),
      )).limit(1))[0];

    if (!authorization || authorization.expiresAt <= now) return { state: "expired" as const };
    if (!authorization.approvedAt || !authorization.organizationId || !authorization.projectId) {
      return { state: "pending" as const };
    }

    const consumed = await tx.update(machineDeviceAuthorizations).set({ consumedAt: now })
      .where(and(eq(machineDeviceAuthorizations.id, authorization.id), isNull(machineDeviceAuthorizations.consumedAt)))
      .returning({ id: machineDeviceAuthorizations.id });
    if (!consumed[0]) return { state: "expired" as const };

    await setTenant(tx, authorization.organizationId);
    const project = (await tx.select({ name: projects.name }).from(projects)
      .where(and(eq(projects.id, authorization.projectId), eq(projects.organizationId, authorization.organizationId)))
      .limit(1))[0];
    if (!project) return { state: "expired" as const };

    const connection = await tx.insert(machineConnections).values({
      organizationId: authorization.organizationId,
      projectId: authorization.projectId,
      name: authorization.deviceName,
      platform: authorization.platform,
      credentialPrefix: credential.prefix,
      credentialHash: credential.hash,
      selectedTools: authorization.selectedTools,
      clientVersion: authorization.clientVersion,
      lastSeenAt: now,
    }).returning({ id: machineConnections.id });
    return {
      state: "approved" as const,
      connectionId: connection[0].id,
      projectId: authorization.projectId,
      projectName: project.name,
    };
  });

  if (result.state === "pending") {
    return NextResponse.json({ error: "authorization_pending" }, { status: 428, headers: { "Cache-Control": "no-store" } });
  }
  if (result.state === "expired") {
    return NextResponse.json({ error: "expired_token" }, { status: 410, headers: { "Cache-Control": "no-store" } });
  }
  return NextResponse.json({ ...result, state: undefined, agentToken: credential.rawKey }, { headers: { "Cache-Control": "no-store" } });
}
