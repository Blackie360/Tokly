import { describe, expect, it } from "vitest";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { applyToolConfigs, boundQueueItems, containsForbiddenFields, decodeOtlpProtobuf, detectTools, normalizeOtlp, parseToolSelection, restoreToolConfigs, sanitizeActivity, storeCredential } from "../packages/sdk/src/machine";
import { activityBatchSchema, machineUsageBatchSchema, pairMachineSchema, pollMachineAuthorizationSchema, startMachineAuthorizationSchema } from "@/lib/machines/schema";
import { generateMachineDeviceAuthorization, hashProjectKey } from "@/lib/security/api-keys";

describe("machine connector privacy", () => {
  it("reduces hostile hook payloads to lifecycle metadata", () => {
    const safe = sanitizeActivity("cursor", { id: "turn-1", status: "success", model: "gpt-5", durationMs: 120, prompt: "secret prompt", response: "secret answer", path: "/private/source.ts", email: "user@example.com", apiKey: "sk-secret", tool_input: { content: "source code" } });
    expect(safe).toEqual(expect.objectContaining({ id: "turn-1", tool: "cursor", model: "gpt-5", status: "success", durationMs: 120 }));
    expect(JSON.stringify(safe)).not.toMatch(/secret|private|example\.com|source code/);
    expect(containsForbiddenFields(safe)).toBe(false);
  });

  it("rejects forbidden fields anywhere in a queued payload", () => {
    expect(containsForbiddenFields({ events: [{ content: "completion" }] })).toBe(true);
    expect(containsForbiddenFields({ events: [{ sessionId: "session", model: "claude" }] })).toBe(false);
  });

  it("converts cumulative OTLP counters to deterministic deltas", () => {
    const checkpoints: Record<string, number> = {};
    const payload = { resourceMetrics: [{ scopeMetrics: [{ metrics: [{ name: "claude_code.token.usage", sum: { dataPoints: [{ asInt: 100, timeUnixNano: String(Date.now() * 1e6), attributes: [{ key: "model", value: { stringValue: "claude-sonnet" } }, { key: "type", value: { stringValue: "input" } }] }] } }] }] }] };
    const first = normalizeOtlp(payload, checkpoints);
    const duplicate = normalizeOtlp(payload, checkpoints);
    expect(first).toHaveLength(1);
    expect(first[0].usage.inputTokens).toBe(100);
    expect(duplicate).toHaveLength(0);
    expect(first[0].id).toMatch(/^[a-f0-9]{64}$/);
  });

  it("decodes OTLP HTTP/protobuf metrics used by Gemini", () => {
    const varint = (input: number) => { const bytes: number[] = []; let value = input; do { let byte = value & 0x7f; value >>>= 7; if (value) byte |= 0x80; bytes.push(byte); } while (value); return Buffer.from(bytes); };
    const bytes = (field: number, value: Buffer | string) => { const body = Buffer.isBuffer(value) ? value : Buffer.from(value); return Buffer.concat([varint((field << 3) | 2), varint(body.length), body]); };
    const fixed = (field: number, value: bigint) => { const body = Buffer.alloc(8); body.writeBigUInt64LE(value); return Buffer.concat([varint((field << 3) | 1), body]); };
    const attribute = (key: string, value: string) => bytes(7, Buffer.concat([bytes(1, key), bytes(2, bytes(1, value))]));
    const point = Buffer.concat([attribute("model", "gemini-2.5-pro"), attribute("type", "thought"), fixed(3, BigInt(Date.now()) * 1_000_000n), fixed(6, 42n)]);
    const metric = Buffer.concat([bytes(1, "gemini_cli.token.usage"), bytes(7, bytes(1, point))]);
    const request = bytes(1, bytes(2, bytes(2, metric)));
    const events = normalizeOtlp(decodeOtlpProtobuf(request), {});
    expect(events).toHaveLength(1);
    expect(events[0]).toEqual(expect.objectContaining({ provider: "google", model: "gemini-2.5-pro", usage: { reasoningTokens: 42 } }));
  });

  it("rejects raw content at the public activity boundary", () => {
    const hostile = activityBatchSchema.safeParse({ events: [{ id: "1", timestamp: new Date().toISOString(), tool: "cursor", eventType: "completed", prompt: "do not store me" }] });
    expect(hostile.success).toBe(false);
  });

  it("keeps machine usage exact and provider-scoped", () => {
    const event = { id: "1", timestamp: new Date().toISOString(), model: "model", operation: "generation", usage: { inputTokens: 3 } };
    expect(machineUsageBatchSchema.safeParse({ events: [{ ...event, provider: "anthropic" }] }).success).toBe(true);
    expect(machineUsageBatchSchema.safeParse({ events: [{ ...event, provider: "openai" }] }).success).toBe(false);
  });

  it("requires the short-lived pairing code shape", () => {
    const request = { code: "TLY-ABCD-2345", deviceName: "Workstation", platform: "linux", clientVersion: "0.2.0", selectedTools: ["codex"] };
    expect(pairMachineSchema.safeParse(request).success).toBe(true);
    expect(pairMachineSchema.safeParse({ ...request, code: "raw-project-key" }).success).toBe(false);
  });

  it("starts browser authorization without accepting a project key", () => {
    const request = { deviceName: "Workstation", platform: "linux", clientVersion: "0.2.0", selectedTools: ["codex"] };
    expect(startMachineAuthorizationSchema.safeParse(request).success).toBe(true);
    expect(startMachineAuthorizationSchema.safeParse({ ...request, code: "tok_live_secret" }).success).toBe(false);
    const authorization = generateMachineDeviceAuthorization();
    expect(authorization.userCode).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    expect(pollMachineAuthorizationSchema.safeParse({ deviceCode: authorization.deviceCode }).success).toBe(true);
    expect(authorization.deviceCodeHash).toBe(hashProjectKey(authorization.deviceCode));
    expect(authorization.deviceCodeHash).not.toContain(authorization.deviceCode);
  });

  it("parses multi-select choices deterministically", () => {
    const choices = ["cursor", "codex", "ollama"] as const;
    expect(parseToolSelection("", [...choices])).toEqual(choices);
    expect(parseToolSelection("3, 1, 3", [...choices])).toEqual(["ollama", "cursor"]);
  });

  it("bounds the offline queue by item count and encoded bytes", () => {
    expect(boundQueueItems([1, 2, 3, 4], 2, 100)).toEqual([3, 4]);
    expect(boundQueueItems([{ model: "a" }, { model: "long-model" }], 10, 25)).toEqual([{ model: "long-model" }]);
  });

  it("merges tool config and restores byte-for-byte backups", async () => {
    const home = await mkdtemp(join(tmpdir(), "tokly-config-test-"));
    const prior = process.env.TOKLY_USER_HOME;
    process.env.TOKLY_USER_HOME = home;
    const files = {
      claude: join(home, ".claude/settings.json"), gemini: join(home, ".gemini/settings.json"),
      cursor: join(home, ".cursor/hooks.json"), codex: join(home, ".codex/config.toml"),
    };
    const originals = { claude: '{"env":{"KEEP":"yes"}}\n', gemini: '{"theme":"dark"}\n', cursor: '{"hooks":{"beforeSubmitPrompt":[{"command":"existing"}]}}\n', codex: 'model = "gpt-5"\n' };
    try {
      for (const [name, path] of Object.entries(files)) { await mkdir(join(path, ".."), { recursive: true }); await writeFile(path, originals[name as keyof typeof originals]); }
      const backups = await applyToolConfigs(["claude_code", "gemini_cli", "cursor", "codex"], 4318, "/tokly/cli.js");
      expect(await readFile(files.claude, "utf8")).toContain('"OTEL_LOGS_EXPORTER": "none"');
      expect(await readFile(files.gemini, "utf8")).toContain('"logPrompts": false');
      expect(await readFile(files.cursor, "utf8")).toContain("beforeSubmitPrompt");
      expect(await readFile(files.codex, "utf8")).toContain("notify =");
      await restoreToolConfigs(backups);
      expect(JSON.parse(await readFile(files.claude, "utf8"))).toEqual({ env: { KEEP: "yes" } });
      expect(JSON.parse(await readFile(files.gemini, "utf8"))).toEqual({ theme: "dark", telemetry: {} });
      expect(JSON.parse(await readFile(files.cursor, "utf8"))).toEqual({ hooks: { beforeSubmitPrompt: [{ command: "existing" }], stop: [] } });
      expect(await readFile(files.codex, "utf8")).toBe(originals.codex);
      expect(JSON.stringify(backups)).not.toContain("KEEP");
    } finally { if (prior === undefined) delete process.env.TOKLY_USER_HOME; else process.env.TOKLY_USER_HOME = prior; await rm(home, { recursive: true, force: true }); }
  });

  it("fails closed when the OS credential store command is unavailable", () => {
    const path = process.env.PATH; process.env.PATH = "";
    try { expect(() => storeCredential("tok_agent_test")).toThrow(/will not save credentials in plaintext/); } finally { process.env.PATH = path; }
  });

  it("returns a typed status for every supported connector", async () => {
    const found = await detectTools();
    expect(found.map((item) => item.tool)).toEqual(["cursor", "codex", "claude_code", "gemini_cli", "ollama"]);
    expect(found.every((item) => ["exact", "activity-only", "conflict", "unsupported-version", "not-detected"].includes(item.status))).toBe(true);
  });
});
