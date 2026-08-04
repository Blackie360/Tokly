import { describe, expect, it } from "vitest";
import {
  generateMachineCredential,
  generatePairingCode,
  generateProjectKey,
  hashProjectKey,
  projectKeyMatches,
  readBearerToken,
  readMachineBearerToken,
} from "@/lib/security/api-keys";

describe("project write keys", () => {
  it("generates a 32-byte secret and stores a one-way digest", () => {
    const key = generateProjectKey("live");
    expect(key.rawKey).toMatch(/^tok_live_[A-Za-z0-9_-]{43}$/);
    expect(key.hash).toHaveLength(64);
    expect(key.hash).not.toContain(key.rawKey);
    expect(projectKeyMatches(key.rawKey, key.hash)).toBe(true);
    expect(projectKeyMatches(`${key.rawKey}x`, key.hash)).toBe(false);
  });

  it("hashes deterministically and only accepts a bearer write key", () => {
    const key = generateProjectKey("test");
    expect(hashProjectKey(key.rawKey)).toBe(key.hash);
    expect(readBearerToken(new Request("https://example.test", { headers: { authorization: `Bearer ${key.rawKey}` } }))).toBe(key.rawKey);
    expect(readBearerToken(new Request("https://example.test", { headers: { authorization: "Bearer provider-secret" } }))).toBeNull();
  });
});

describe("machine credentials", () => {
  it("generates pairing codes and scoped agent tokens", () => {
    const code = generatePairingCode();
    const token = generateMachineCredential();
    expect(code.rawCode).toMatch(/^TLY-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    expect(token.rawKey).toMatch(/^tok_agent_/);
    expect(token.hash).not.toContain(token.rawKey);
    expect(readMachineBearerToken(new Request("https://tokly.test", { headers: { authorization: `Bearer ${token.rawKey}` } }))).toBe(token.rawKey);
  });
});
