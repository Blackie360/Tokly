import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { machineDeviceAuthorizations } from "@/lib/db/schema";
import { startMachineAuthorizationSchema } from "@/lib/machines/schema";
import { generateMachineDeviceAuthorization } from "@/lib/security/api-keys";

const EXPIRES_IN_SECONDS = 10 * 60;
const POLL_INTERVAL_SECONDS = 2;

export async function POST(request: Request) {
  const parsed = startMachineAuthorizationSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid authorization request." }, { status: 400 });

  const authorization = generateMachineDeviceAuthorization();
  await getDb().insert(machineDeviceAuthorizations).values({
    deviceCodeHash: authorization.deviceCodeHash,
    userCodeHash: authorization.userCodeHash,
    deviceName: parsed.data.deviceName,
    platform: parsed.data.platform,
    clientVersion: parsed.data.clientVersion,
    selectedTools: parsed.data.selectedTools,
    expiresAt: new Date(Date.now() + EXPIRES_IN_SECONDS * 1_000),
    intervalSeconds: POLL_INTERVAL_SECONDS,
  });

  const origin = new URL(request.url).origin;
  const verificationUri = `${origin}/connect/machine`;
  const verificationUriComplete = `${verificationUri}?code=${encodeURIComponent(authorization.userCode)}`;
  return NextResponse.json({
    deviceCode: authorization.deviceCode,
    userCode: authorization.userCode,
    verificationUri,
    verificationUriComplete,
    expiresIn: EXPIRES_IN_SECONDS,
    interval: POLL_INTERVAL_SECONDS,
  }, { headers: { "Cache-Control": "no-store" } });
}
