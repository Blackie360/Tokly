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
