import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export type KeyEnvironment = "live" | "test";

export function hashProjectKey(rawKey: string) {
  return createHash("sha256").update(rawKey, "utf8").digest("hex");
}

export function generateProjectKey(environment: KeyEnvironment = "live") {
  const rawKey = `tok_${environment}_${randomBytes(32).toString("base64url")}`;
  return {
    rawKey,
    prefix: rawKey.slice(0, 17),
    hash: hashProjectKey(rawKey),
  };
}

export function projectKeyMatches(rawKey: string, expectedHash: string) {
  const actual = Buffer.from(hashProjectKey(rawKey), "hex");
  const expected = Buffer.from(expectedHash, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function readBearerToken(request: Request) {
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) return null;
  const token = authorization.slice(7).trim();
  return /^tok_(live|test)_[A-Za-z0-9_-]{40,}$/.test(token) ? token : null;
}

export function generateMachineCredential() {
  const rawKey = `tok_agent_${randomBytes(32).toString("base64url")}`;
  return { rawKey, prefix: rawKey.slice(0, 18), hash: hashProjectKey(rawKey) };
}

export function generatePairingCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(8);
  const body = Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
  const rawCode = `TLY-${body.slice(0, 4)}-${body.slice(4)}`;
  return { rawCode, hash: hashProjectKey(rawCode) };
}

export function generateMachineDeviceAuthorization() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(8);
  const body = Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
  const userCode = `${body.slice(0, 4)}-${body.slice(4)}`;
  const deviceCode = randomBytes(32).toString("base64url");
  return {
    deviceCode,
    deviceCodeHash: hashProjectKey(deviceCode),
    userCode,
    userCodeHash: hashProjectKey(userCode),
  };
}

export function readMachineBearerToken(request: Request) {
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) return null;
  const token = authorization.slice(7).trim();
  return /^tok_agent_[A-Za-z0-9_-]{40,}$/.test(token) ? token : null;
}
