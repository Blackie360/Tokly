import { createHash, randomUUID } from "node:crypto";
import { access, mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { constants, existsSync } from "node:fs";
import { homedir, hostname, platform } from "node:os";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
import { VERSION } from "./version.js";

export type MachineTool = "cursor" | "codex" | "claude_code" | "gemini_cli" | "ollama";
export type ConnectorFidelity = "exact" | "activity-only";
export type ConnectorStatus = "exact" | "activity-only" | "conflict" | "unsupported-version" | "not-detected";
export type ToolDetection = { tool: MachineTool; label: string; status: ConnectorStatus; fidelity: ConnectorFidelity; version?: string; executable?: string; conflict?: string };
export type MachineConfig = { endpoint: string; connectionId: string; projectId: string; projectName: string; port: number; selectedTools: MachineTool[]; backups: Record<string, string | null> };

const userHome = () => process.env.TOKLY_USER_HOME || homedir();
const appDir = () => process.env.TOKLY_HOME || (platform() === "win32" ? join(process.env.LOCALAPPDATA || userHome(), "Tokly") : join(process.env.XDG_CONFIG_HOME || join(userHome(), ".config"), "tokly"));
export const configPath = () => join(appDir(), "machine.json");
const queuePath = () => join(appDir(), "queue.json");
const checkpointPath = () => join(appDir(), "checkpoints.json");
const SERVICE = "tokly-machine";

async function exists(path: string) { try { await access(path, constants.X_OK); return true; } catch { return false; } }
function commandPath(name: string) {
  const finder = platform() === "win32" ? "where.exe" : "which";
  const found = spawnSync(finder, [name], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  return found.status === 0 ? found.stdout.trim().split(/\r?\n/)[0] : undefined;
}

const passEntry = () => `tokly/machines/${hostname().replace(/[^a-zA-Z0-9._-]/g, "_")}`;
const passwordStoreDir = () => process.env.PASSWORD_STORE_DIR || join(userHome(), ".password-store");
export function credentialStoreAvailable() {
  if (platform() === "darwin") return Boolean(commandPath("security"));
  if (platform() === "win32") return Boolean(commandPath("powershell.exe"));
  return Boolean(commandPath("secret-tool")) || (Boolean(commandPath("pass")) && existsSync(join(passwordStoreDir(), ".gpg-id")));
}

export function openBrowser(url: string) {
  let parsed: URL;
  try { parsed = new URL(url); } catch { return false; }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return false;
  const command = platform() === "darwin" ? "open" : platform() === "win32" ? "rundll32.exe" : "xdg-open";
  const args = platform() === "win32" ? ["url.dll,FileProtocolHandler", parsed.href] : [parsed.href];
  const result = spawnSync(command, args, { encoding: "utf8", timeout: 5_000, stdio: "ignore" });
  return result.status === 0;
}
function versionOf(path: string | undefined) {
  if (!path) return undefined;
  const result = spawnSync(path, ["--version"], { encoding: "utf8", timeout: 3_000, stdio: ["ignore", "pipe", "pipe"] });
  const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`.trim();
  return result.status === 0 ? (output.split(/\r?\n/)[0].slice(0, 80) || "installed") : "installed";
}
async function readJson(path: string): Promise<Record<string, unknown>> { try { return JSON.parse(await readFile(path, "utf8")) as Record<string, unknown>; } catch { return {}; } }

export async function detectTools(): Promise<ToolDetection[]> {
  const specs: Array<[MachineTool, string, string[], ConnectorFidelity]> = [
    ["cursor", "Cursor", ["cursor"], "activity-only"], ["codex", "Codex", ["codex"], "activity-only"],
    ["claude_code", "Claude Code", ["claude"], "exact"], ["gemini_cli", "Gemini CLI", ["gemini"], "exact"],
    ["ollama", "Ollama", ["ollama"], "activity-only"],
  ];
  const standard: Partial<Record<MachineTool, string[]>> = {
    cursor: platform() === "darwin" ? ["/Applications/Cursor.app/Contents/MacOS/Cursor"] : [join(userHome(), ".local/bin/cursor")],
    ollama: platform() === "darwin" ? ["/Applications/Ollama.app/Contents/Resources/ollama"] : ["/usr/local/bin/ollama"],
  };
  const claudeSettings = await readJson(join(userHome(), ".claude", "settings.json"));
  const claudeEnv = (claudeSettings.env ?? {}) as Record<string, unknown>;
  const geminiSettings = await readJson(join(userHome(), ".gemini", "settings.json"));
  const geminiTelemetry = (geminiSettings.telemetry ?? {}) as Record<string, unknown>;
  const codexConfig = await backup(join(userHome(), ".codex", "config.toml")) ?? "";
  return Promise.all(specs.map(async ([tool, label, names, fidelity]) => {
    let executable = names.map(commandPath).find(Boolean);
    if (!executable) executable = (await Promise.all((standard[tool] ?? []).map(async (path) => (await exists(path)) ? path : undefined))).find(Boolean);
    if (!executable) return { tool, label, fidelity, status: "not-detected" as const };
    const conflict = tool === "claude_code" && claudeEnv.OTEL_EXPORTER_OTLP_ENDPOINT ? "Existing Claude OTLP destination" : tool === "gemini_cli" && geminiTelemetry.otlpEndpoint ? "Existing Gemini OTLP destination" : tool === "codex" && /^notify\s*=/m.test(codexConfig) ? "Existing Codex notify hook" : undefined;
    return { tool, label, executable, version: versionOf(executable), fidelity, status: conflict ? "conflict" : fidelity, conflict };
  }));
}

async function writeJson(path: string, value: unknown) { await mkdir(dirname(path), { recursive: true, mode: 0o700 }); await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 }); }
async function backup(path: string) { try { return await readFile(path, "utf8"); } catch { return null; } }
type PreviousValue = { exists: boolean; value?: unknown };
function snapshotValues(target: Record<string, unknown>, applied: Record<string, unknown>) { return Object.fromEntries(Object.keys(applied).map((key) => [key, { exists: Object.hasOwn(target, key), value: target[key] } satisfies PreviousValue])); }

export function previewChanges(tools: MachineTool[], port: number) {
  const changes = [`Collector: http://127.0.0.1:${port}`, `Login service: ${servicePath()}`];
  if (tools.includes("claude_code")) changes.push(`Claude settings: ${join(userHome(), ".claude/settings.json")}`);
  if (tools.includes("gemini_cli")) changes.push(`Gemini settings: ${join(userHome(), ".gemini/settings.json")}`);
  if (tools.includes("cursor")) changes.push(`Cursor hooks: ${join(userHome(), ".cursor/hooks.json")}`);
  if (tools.includes("codex")) changes.push(`Codex config: ${join(userHome(), ".codex/config.toml")}`);
  if (tools.includes("ollama")) changes.push("Ollama: read-only localhost /api/ps polling");
  return changes;
}

export async function applyToolConfigs(tools: MachineTool[], port: number, cliPath: string) {
  const backups: Record<string, string | null> = {};
  const endpoint = `http://127.0.0.1:${port}`;
  const claudePath = join(userHome(), ".claude/settings.json");
  const geminiPath = join(userHome(), ".gemini/settings.json");
  const codexPath = join(userHome(), ".codex/config.toml");
  if (tools.includes("claude_code") && ((await readJson(claudePath)).env as Record<string, unknown> | undefined)?.OTEL_EXPORTER_OTLP_ENDPOINT) throw new Error("Claude already has an OTLP destination; it was left unchanged.");
  if (tools.includes("gemini_cli") && ((await readJson(geminiPath)).telemetry as Record<string, unknown> | undefined)?.otlpEndpoint) throw new Error("Gemini already has an OTLP destination; it was left unchanged.");
  if (tools.includes("codex") && /^notify\s*=/m.test(await backup(codexPath) ?? "")) throw new Error("Codex already has a notify hook; it was left unchanged.");
  try {
  if (tools.includes("claude_code")) {
    const path = claudePath; const value = await readJson(path); const env = (value.env ?? {}) as Record<string, unknown>;
    const applied = { CLAUDE_CODE_ENABLE_TELEMETRY: "1", OTEL_METRICS_EXPORTER: "otlp", OTEL_LOGS_EXPORTER: "none", OTEL_TRACES_EXPORTER: "none", OTEL_EXPORTER_OTLP_PROTOCOL: "http/json", OTEL_EXPORTER_OTLP_ENDPOINT: endpoint };
    backups[path] = JSON.stringify({ kind: "json", section: "env", previous: snapshotValues(env, applied), applied });
    value.env = { ...env, ...applied };
    await writeJson(path, value);
  }
  if (tools.includes("gemini_cli")) {
    const path = geminiPath; const value = await readJson(path); const telemetry = (value.telemetry ?? {}) as Record<string, unknown>;
    const applied = { enabled: true, target: "local", otlpEndpoint: endpoint, otlpProtocol: "http", logPrompts: false, useCollector: true, traces: false };
    backups[path] = JSON.stringify({ kind: "json", section: "telemetry", previous: snapshotValues(telemetry, applied), applied });
    value.telemetry = { ...telemetry, ...applied };
    await writeJson(path, value);
  }
  if (tools.includes("cursor")) {
    const path = join(userHome(), ".cursor/hooks.json"); const value = await readJson(path); const hooks = (value.hooks ?? {}) as Record<string, unknown[]>;
    const entry = { command: `${JSON.stringify(process.execPath)} ${JSON.stringify(cliPath)} hook cursor`, timeout: 5 };
    backups[path] = JSON.stringify({ kind: "cursor", command: entry.command, previousVersion: { exists: Object.hasOwn(value, "version"), value: value.version } satisfies PreviousValue });
    value.version = typeof value.version === "number" ? value.version : 1;
    hooks.stop = [...(hooks.stop ?? []).filter((item) => !JSON.stringify(item).includes(" hook cursor")), entry]; value.hooks = hooks; await writeJson(path, value);
  }
  if (tools.includes("codex")) {
    const path = codexPath; const current = await backup(path) ?? ""; const line = `notify = [${JSON.stringify(process.execPath)}, ${JSON.stringify(cliPath)}, "hook", "codex"]`;
    backups[path] = JSON.stringify({ kind: "codex", line });
    await mkdir(dirname(path), { recursive: true, mode: 0o700 }); await writeFile(path, `${current.trimEnd()}\n${line}\n`, { mode: 0o600 });
  }
    return backups;
  } catch (error) {
    await restoreToolConfigs(backups);
    throw error;
  }
}

export async function restoreToolConfigs(backups: Record<string, string | null>) {
  for (const [path, descriptorText] of Object.entries(backups)) {
    if (!descriptorText) continue;
    const descriptor = JSON.parse(descriptorText) as { kind: string; section?: string; previous?: Record<string, PreviousValue>; applied?: Record<string, unknown>; command?: string; line?: string; previousVersion?: PreviousValue };
    if (descriptor.kind === "json" && descriptor.section && descriptor.previous && descriptor.applied) {
      const root = await readJson(path); const section = (root[descriptor.section] ?? {}) as Record<string, unknown>;
      for (const [key, previous] of Object.entries(descriptor.previous)) { if (section[key] !== descriptor.applied[key]) continue; if (previous.exists) section[key] = previous.value; else delete section[key]; }
      root[descriptor.section] = section; await writeJson(path, root);
    } else if (descriptor.kind === "cursor" && descriptor.command) {
      const root = await readJson(path); const hooks = (root.hooks ?? {}) as Record<string, unknown[]>; hooks.stop = (hooks.stop ?? []).filter((item) => (item as { command?: unknown })?.command !== descriptor.command); root.hooks = hooks; if (root.version === 1 && descriptor.previousVersion) { if (descriptor.previousVersion.exists) root.version = descriptor.previousVersion.value; else delete root.version; } await writeJson(path, root);
    } else if (descriptor.kind === "codex" && descriptor.line) {
      const current = await backup(path) ?? ""; await writeFile(path, `${current.split(/\r?\n/).filter((line) => line !== descriptor.line).join("\n").trimEnd()}\n`, { mode: 0o600 });
    }
  }
}

function secretCommands(action: "store" | "read" | "delete", token?: string) {
  if (platform() === "darwin") {
    const args = action === "store" ? ["add-generic-password", "-U", "-a", hostname(), "-s", SERVICE, "-w", token!] : action === "read" ? ["find-generic-password", "-a", hostname(), "-s", SERVICE, "-w"] : ["delete-generic-password", "-a", hostname(), "-s", SERVICE];
    return [{ command: "security", args, input: undefined }];
  }
  if (platform() === "linux") {
    const commands: Array<{ command: string; args: string[]; input?: string }> = [];
    if (commandPath("secret-tool")) commands.push({ command: "secret-tool", args: action === "store" ? ["store", "--label=Tokly machine credential", "service", SERVICE, "machine", hostname()] : action === "read" ? ["lookup", "service", SERVICE, "machine", hostname()] : ["clear", "service", SERVICE, "machine", hostname()], input: action === "store" ? token : undefined });
    if (commandPath("pass") && existsSync(join(passwordStoreDir(), ".gpg-id"))) commands.push({ command: "pass", args: action === "store" ? ["insert", "--multiline", "--force", passEntry()] : action === "read" ? ["show", passEntry()] : ["rm", "--force", passEntry()], input: action === "store" ? `${token}\n` : undefined });
    return commands;
  }
  const verb = action === "store" ? "store" : action === "read" ? "read" : "delete";
  return [{ command: "powershell.exe", args: ["-NoProfile", "-NonInteractive", "-File", join(dirname(new URL(import.meta.url).pathname), "../src/windows-secret.ps1"), verb], input: token }];
}
function runSecretCommand(command: { command: string; args: string[]; input?: string }) { return spawnSync(command.command, command.args, { input: command.input, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }); }
export function storeCredential(token: string) { for (const command of secretCommands("store", token)) if (runSecretCommand(command).status === 0) return; throw new Error("The encrypted credential store is unavailable. Install/unlock Secret Service, initialize pass, or unlock your system keychain; Tokly will not save credentials in plaintext."); }
export function readCredential() { for (const command of secretCommands("read")) { const result = runSecretCommand(command); if (result.status === 0 && result.stdout.trim()) return result.stdout.trim(); } throw new Error("Tokly machine credential was not found in an encrypted credential store."); }
export function deleteCredential() { for (const command of secretCommands("delete")) runSecretCommand(command); }

export async function loadConfig() { return JSON.parse(await readFile(configPath(), "utf8")) as MachineConfig; }
export async function saveConfig(config: MachineConfig) { await writeJson(configPath(), config); }
export async function deleteConfig() { await unlink(configPath()).catch(() => undefined); }
export async function firstFreePort() { for (let port = 4318; port <= 4328; port += 1) { try { const response = await fetch(`http://127.0.0.1:${port}/health`, { signal: AbortSignal.timeout(100) }); if (response.ok) continue; } catch { return port; } } throw new Error("Ports 4318-4328 are already in use."); }

function servicePath() { if (process.env.TOKLY_SERVICE_DRY_RUN === "1") return join(appDir(), "service", platform() === "win32" ? "Tokly-Machine.task" : platform() === "darwin" ? "com.tokly.machine.plist" : "tokly-machine.service"); return platform() === "linux" ? join(process.env.XDG_CONFIG_HOME || join(userHome(), ".config"), "systemd/user/tokly-machine.service") : platform() === "darwin" ? join(userHome(), "Library/LaunchAgents/com.tokly.machine.plist") : "Windows Task Scheduler: Tokly Machine"; }
export async function installService(cliPath: string) {
  const path = servicePath();
  if (process.env.TOKLY_SERVICE_DRY_RUN === "1") { await mkdir(dirname(path), { recursive: true }); await writeFile(path, JSON.stringify({ platform: platform(), executable: process.execPath, cliPath, command: "collector" })); return; }
  if (platform() === "linux") { await mkdir(dirname(path), { recursive: true }); await writeFile(path, `[Unit]\nDescription=Tokly machine collector\nAfter=network-online.target\n\n[Service]\nExecStart=${process.execPath} ${cliPath} collector\nRestart=on-failure\n\n[Install]\nWantedBy=default.target\n`); const reload = spawnSync("systemctl", ["--user", "daemon-reload"]); const enable = spawnSync("systemctl", ["--user", "enable", "--now", "tokly-machine.service"]); if (reload.status !== 0 || enable.status !== 0) { await unlink(path).catch(() => undefined); throw new Error("Could not install the systemd user service."); } }
  else if (platform() === "darwin") { await mkdir(dirname(path), { recursive: true }); await writeFile(path, `<?xml version="1.0"?><!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd"><plist version="1.0"><dict><key>Label</key><string>com.tokly.machine</string><key>ProgramArguments</key><array><string>${process.execPath}</string><string>${cliPath}</string><string>collector</string></array><key>RunAtLoad</key><true/><key>KeepAlive</key><true/></dict></plist>`); if (spawnSync("launchctl", ["load", "-w", path]).status !== 0) { await unlink(path).catch(() => undefined); throw new Error("Could not install the macOS LaunchAgent."); } }
  else if (spawnSync("schtasks.exe", ["/Create", "/F", "/SC", "ONLOGON", "/TN", "Tokly Machine", "/TR", `\"${process.execPath}\" \"${cliPath}\" collector`]).status !== 0) throw new Error("Could not install the Windows logon task.");
}
export function startService() { if (process.env.TOKLY_SERVICE_DRY_RUN === "1") return true; return platform() === "linux" ? spawnSync("systemctl", ["--user", "start", "tokly-machine.service"]).status === 0 : platform() === "darwin" ? spawnSync("launchctl", ["start", "com.tokly.machine"]).status === 0 : spawnSync("schtasks.exe", ["/Run", "/TN", "Tokly Machine"]).status === 0; }
export function stopService() { if (process.env.TOKLY_SERVICE_DRY_RUN === "1") return true; return platform() === "linux" ? spawnSync("systemctl", ["--user", "stop", "tokly-machine.service"]).status === 0 : platform() === "darwin" ? spawnSync("launchctl", ["stop", "com.tokly.machine"]).status === 0 : spawnSync("schtasks.exe", ["/End", "/TN", "Tokly Machine"]).status === 0; }
export async function removeService() { stopService(); const path = servicePath(); if (process.env.TOKLY_SERVICE_DRY_RUN === "1") { await unlink(path).catch(() => undefined); return; } if (platform() === "linux") { spawnSync("systemctl", ["--user", "disable", "tokly-machine.service"]); await unlink(path).catch(() => undefined); spawnSync("systemctl", ["--user", "daemon-reload"]); } else if (platform() === "darwin") { spawnSync("launchctl", ["unload", path]); await unlink(path).catch(() => undefined); } else spawnSync("schtasks.exe", ["/Delete", "/F", "/TN", "Tokly Machine"]); }

const forbidden = new Set(["prompt", "response", "completion", "message", "content", "path", "email", "apiKey", "key", "credential", "arguments", "tool_input", "tool_output"]);
export function sanitizeActivity(tool: "cursor" | "codex" | "ollama", value: unknown) {
  const input = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const pick = (...keys: string[]) => keys.map((key) => input[key]).find((item) => typeof item === "string") as string | undefined;
  const eventType = pick("eventType", "type", "status")?.slice(0, 64) || "completed"; const rawStatus = pick("status");
  return { id: pick("eventId", "id", "turn-id")?.slice(0, 128) || randomUUID(), timestamp: new Date().toISOString(), tool, eventType, model: pick("model")?.slice(0, 160), status: (["success", "error", "started", "stopped"] as const).find((status) => status === rawStatus) ?? (/complete/i.test(eventType) ? "success" as const : undefined), durationMs: typeof input.durationMs === "number" ? Math.max(0, Math.min(86_400_000, Math.round(input.durationMs))) : undefined, sessionId: pick("sessionId", "conversation_id", "thread-id", "turn-id")?.slice(0, 128) };
}
export function containsForbiddenFields(value: unknown): boolean { if (!value || typeof value !== "object") return false; return Object.entries(value as Record<string, unknown>).some(([key, child]) => forbidden.has(key) || containsForbiddenFields(child)); }

type OtlpEvent = { id: string; timestamp: string; provider: "anthropic" | "google"; model: string; operation: "generation"; usage: { inputTokens?: number; outputTokens?: number; cacheReadTokens?: number; reasoningTokens?: number }; dimensions: { environment: "machine"; feature: string; sessionId?: string } };
type ProtoField = { wire: number; value: bigint | Buffer };
function protoFields(buffer: Buffer) { const fields = new Map<number, ProtoField[]>(); let offset = 0; const varint = () => { let value = 0n; let shift = 0n; while (offset < buffer.length) { const byte = buffer[offset++]; value |= BigInt(byte & 0x7f) << shift; if (!(byte & 0x80)) break; shift += 7n; } return value; }; while (offset < buffer.length) { const tag = Number(varint()); const field = tag >> 3; const wire = tag & 7; let value: bigint | Buffer; if (wire === 0) value = varint(); else if (wire === 1) { value = buffer.subarray(offset, offset + 8); offset += 8; } else if (wire === 2) { const length = Number(varint()); value = buffer.subarray(offset, offset + length); offset += length; } else if (wire === 5) { value = buffer.subarray(offset, offset + 4); offset += 4; } else throw new Error("Unsupported OTLP protobuf wire type."); const list = fields.get(field) ?? []; list.push({ wire, value }); fields.set(field, list); } return fields; }
const nested = (fields: Map<number, ProtoField[]>, number: number) => (fields.get(number) ?? []).map((field) => protoFields(field.value as Buffer));
const protoString = (fields: Map<number, ProtoField[]>, number: number) => ((fields.get(number)?.[0]?.value as Buffer | undefined)?.toString("utf8"));
export function decodeOtlpProtobuf(buffer: Buffer) {
  const resourceMetrics = nested(protoFields(buffer), 1).map((resource) => ({ scopeMetrics: nested(resource, 2).map((scope) => ({ metrics: nested(scope, 2).map((metric) => ({ name: protoString(metric, 1), sum: { dataPoints: nested(nested(metric, 7)[0] ?? new Map(), 1).map((point) => {
    const attributes = nested(point, 7).map((keyValue) => ({ key: protoString(keyValue, 1), value: { stringValue: protoString(nested(keyValue, 2)[0] ?? new Map(), 1) } }));
    const double = point.get(4)?.[0]?.value as Buffer | undefined; const integer = point.get(6)?.[0]?.value as Buffer | undefined; const start = point.get(2)?.[0]?.value as Buffer | undefined; const time = point.get(3)?.[0]?.value as Buffer | undefined;
    return { attributes, ...(double ? { asDouble: double.readDoubleLE(0) } : { asInt: integer ? Number(integer.readBigInt64LE(0)) : 0 }), startTimeUnixNano: start ? start.readBigUInt64LE(0).toString() : undefined, timeUnixNano: time ? time.readBigUInt64LE(0).toString() : undefined };
  }) } })) })) }));
  return { resourceMetrics };
}
export function normalizeOtlp(payload: unknown, checkpoints: Record<string, number>) {
  const events: OtlpEvent[] = []; const root = payload as Record<string, unknown>; const resourceMetrics = Array.isArray(root?.resourceMetrics) ? root.resourceMetrics : [];
  for (const resource of resourceMetrics as Array<Record<string, unknown>>) for (const scope of (resource.scopeMetrics as Array<Record<string, unknown>> ?? [])) for (const metric of (scope.metrics as Array<Record<string, unknown>> ?? [])) {
    const name = String(metric.name ?? ""); const provider = name.includes("claude") || name.includes("anthropic") ? "anthropic" : name.includes("gemini") || name === "gen_ai.client.token.usage" ? "google" : null; if (!provider || !name.includes("token")) continue;
    for (const point of ((metric.sum as Record<string, unknown>)?.dataPoints as Array<Record<string, unknown>> ?? [])) {
      const attrs = Object.fromEntries(((point.attributes as Array<Record<string, unknown>>) ?? []).map((attr) => [String(attr.key), Object.values((attr.value as Record<string, unknown>) ?? {})[0]]));
      const model = attrs.model ?? attrs["gen_ai.request.model"] ?? attrs["gen_ai.response.model"] ?? "unknown"; const tokenType = attrs.type ?? attrs.token_type ?? attrs["gen_ai.token.type"] ?? "input";
      const total = Number(point.asInt ?? point.asDouble ?? 0); const key = createHash("sha256").update(`${provider}:${name}:${model}:${tokenType}:${attrs.session_id ?? attrs["session.id"] ?? ""}:${point.startTimeUnixNano ?? ""}`).digest("hex"); const delta = Math.max(0, total - (checkpoints[key] ?? 0)); checkpoints[key] = Math.max(total, checkpoints[key] ?? 0); if (!delta) continue;
      const type = String(tokenType); if (/tool/i.test(type)) continue; const usage: OtlpEvent["usage"] = {}; if (/output/i.test(type)) usage.outputTokens = delta; else if (/cache/i.test(type)) usage.cacheReadTokens = delta; else if (/thought|reason/i.test(type)) usage.reasoningTokens = delta; else usage.inputTokens = delta;
      const sessionId = attrs.session_id ?? attrs["session.id"]; events.push({ id: createHash("sha256").update(`${key}:${total}`).digest("hex"), timestamp: new Date(Number(point.timeUnixNano ?? Date.now() * 1e6) / 1e6).toISOString(), provider, model: String(model), operation: "generation", usage, dimensions: { environment: "machine", feature: provider === "anthropic" ? "claude-code" : "gemini-cli", sessionId: sessionId ? String(sessionId).slice(0, 128) : undefined } });
    }
  }
  return events;
}

async function post(endpoint: string, path: string, token: string, body: unknown) { const response = await fetch(`${endpoint}${path}`, { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json", "user-agent": `tokly-machine/${VERSION}` }, body: JSON.stringify(body) }); if (!response.ok) throw new Error(`Tokly returned HTTP ${response.status}.`); return response; }
export function boundQueueItems(items: unknown[], maxItems = 10_000, maxBytes = 10_000_000) { const bounded = [...items]; while (bounded.length > maxItems || JSON.stringify(bounded).length > maxBytes) bounded.shift(); return bounded; }
export function parseToolSelection(answer: string, tools: MachineTool[]) { if (!answer.trim()) return [...tools]; return [...new Set(answer.split(",").map((value) => tools[Number(value.trim()) - 1]).filter((tool): tool is MachineTool => Boolean(tool)))]; }
async function enqueue(path: string, body: unknown) { const current = await readJson(queuePath()); const items = Array.isArray(current.items) ? current.items as unknown[] : []; await writeJson(queuePath(), { items: boundQueueItems([...items, { path, body }]) }); }
async function sendOrQueue(config: MachineConfig, token: string, path: string, body: unknown) { if (containsForbiddenFields(body)) throw new Error("Refused unsafe telemetry payload."); try { await post(config.endpoint, path, token, body); } catch { await enqueue(path, body); } }
async function flushQueue(config: MachineConfig, token: string) { const stored = await readJson(queuePath()); const items = Array.isArray(stored.items) ? stored.items as Array<{ path: string; body: unknown }> : []; const remaining: typeof items = []; for (const item of items) { if (containsForbiddenFields(item.body)) continue; try { await post(config.endpoint, item.path, token, item.body); } catch { remaining.push(item); } } await writeJson(queuePath(), { items: remaining }); }

export async function runCollector() {
  const { createServer } = await import("node:http"); const config = await loadConfig(); const token = readCredential(); const checkpoints = await readJson(checkpointPath()) as Record<string, number>;
  const server = createServer(async (request, response) => { const chunks: Buffer[] = []; for await (const chunk of request) chunks.push(Buffer.from(chunk)); const rawBody = Buffer.concat(chunks); let body: unknown = {}; try { body = request.headers["content-type"]?.includes("protobuf") ? decodeOtlpProtobuf(rawBody) : JSON.parse(rawBody.toString("utf8") || "{}"); } catch { response.writeHead(400).end(); return; }
    if (request.url === "/health") { response.writeHead(200, { "content-type": "application/json" }).end('{"ok":true}'); return; }
    if (request.url === "/v1/metrics" && request.method === "POST") { const events = normalizeOtlp(body, checkpoints); if (events.length) await sendOrQueue(config, token, "/api/v1/machine-usage", { events }); await writeJson(checkpointPath(), checkpoints); response.writeHead(200).end(); return; }
    const match = request.url?.match(/^\/hooks\/(cursor|codex)$/); if (match && request.method === "POST") { await sendOrQueue(config, token, "/api/v1/machine-activity", { events: [sanitizeActivity(match[1] as "cursor" | "codex", body)] }); response.writeHead(202).end(); return; }
    response.writeHead(404).end();
  });
  server.listen(config.port, "127.0.0.1");
  void post(config.endpoint, "/api/v1/machines/heartbeat", token, { selectedTools: config.selectedTools, collectorPort: config.port }).catch(() => undefined);
  setInterval(() => void post(config.endpoint, "/api/v1/machines/heartbeat", token, { selectedTools: config.selectedTools, collectorPort: config.port }).catch(() => undefined), 60_000).unref();
  setInterval(() => void flushQueue(config, token), 15_000).unref();
  if (config.selectedTools.includes("ollama")) {
    let loaded = new Set<string>();
    setInterval(() => void (async () => { try { const response = await fetch("http://127.0.0.1:11434/api/ps", { signal: AbortSignal.timeout(2_000) }); const body = await response.json() as { models?: Array<{ name?: string }> }; const current = new Set((body.models ?? []).map((model) => model.name).filter((name): name is string => Boolean(name)));
      for (const model of current) if (!loaded.has(model)) await sendOrQueue(config, token, "/api/v1/machine-activity", { events: [{ ...sanitizeActivity("ollama", { eventType: "model_loaded", model, status: "started" }), id: createHash("sha256").update(`ollama:loaded:${model}:${Date.now()}`).digest("hex") }] });
      for (const model of loaded) if (!current.has(model)) await sendOrQueue(config, token, "/api/v1/machine-activity", { events: [{ ...sanitizeActivity("ollama", { eventType: "model_unloaded", model, status: "stopped" }), id: createHash("sha256").update(`ollama:unloaded:${model}:${Date.now()}`).digest("hex") }] }); loaded = current;
    } catch { /* Ollama is optional and may be stopped. */ } })(), 30_000).unref();
  }
}

export async function sendHook(tool: "cursor" | "codex", body: unknown) { const config = await loadConfig(); await fetch(`http://127.0.0.1:${config.port}/hooks/${tool}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }); }
export function machineName() { return hostname(); }
