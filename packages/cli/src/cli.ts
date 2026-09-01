#!/usr/bin/env node

import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { fileURLToPath } from "node:url";
import { acceptsConfirmation, selectTools } from "./prompts.js";
import { VERSION } from "./version.js";
import {
  applyToolConfigs, configPath, deleteConfig, deleteCredential, detectTools, firstFreePort,
  installService, loadConfig, machineName, previewChanges, readCredential, removeService,
  restoreToolConfigs, runCollector, sanitizeActivity, saveConfig, sendHook, startService,
  stopService, storeCredential,
  openBrowser, credentialStoreAvailable,
} from "./machine.js";

const help = `Tokly ${VERSION}\n\nUsage:\n  tokly init [--endpoint URL]\n  tokly status\n  tokly tools\n  tokly start | stop\n  tokly disconnect\n`;
const terminal = () => createInterface({ input: stdin, output: stdout });

async function init() {
  let existing: Awaited<ReturnType<typeof loadConfig>> | undefined;
  try { existing = await loadConfig(); } catch { /* not initialized */ }
  if (existing) throw new Error(`This machine is already connected to ${existing.projectName}. Run \"tokly disconnect\" first.`);
  console.log("\nTokly machine setup\nOperational metadata only. Prompts, responses, files, emails, and provider credentials are never collected.\n");
  const endpointArg = process.argv.indexOf("--endpoint");
  const endpoint = (endpointArg >= 0 ? process.argv[endpointArg + 1] : undefined) || process.env.TOKLY_ENDPOINT || "https://tokly.blackielabs.com";
  const detections = await detectTools();
  console.table(detections.map((item) => ({ tool: item.label, version: item.version ?? "—", monitoring: item.status, note: item.conflict ?? "" })));
  const selectable = detections.filter((item) => item.status === "exact" || item.status === "activity-only");
  if (!selectable.length) throw new Error("No supported AI developer tools were detected.");
  if (!credentialStoreAvailable()) throw new Error("No supported encrypted credential store was found. On Linux, install libsecret-tools or initialize pass; Tokly will not save credentials in plaintext.");
  const selected = (await selectTools(selectable)).map((item) => item.tool);
  if (!selected.length) throw new Error("Select at least one tool.");
  const port = await firstFreePort();
  console.log("\nChanges to apply:"); for (const line of previewChanges(selected, port)) console.log(`  • ${line}`);
  const rl = terminal();
  try {
    const confirmation = await rl.question("\nApply these changes? [Y/n] ");
    if (!acceptsConfirmation(confirmation, true)) { console.log("No changes applied."); return; }
    const baseEndpoint = endpoint.replace(/\/$/, "");
    const authorizationResponse = await fetch(`${baseEndpoint}/api/v1/machines/authorize/start`, {
      method: "POST",
      headers: { "content-type": "application/json", "user-agent": `tokly-machine/${VERSION}` },
      body: JSON.stringify({ deviceName: machineName(), platform: process.platform, clientVersion: VERSION, selectedTools: selected }),
    });
    const authorization = await authorizationResponse.json() as {
      error?: string; deviceCode?: string; userCode?: string; verificationUriComplete?: string; expiresIn?: number; interval?: number;
    };
    if (!authorizationResponse.ok || !authorization.deviceCode || !authorization.userCode || !authorization.verificationUriComplete) {
      throw new Error(authorization.error || `Authorization failed with HTTP ${authorizationResponse.status}.`);
    }
    console.log(`\nAuthorize this terminal in Tokly. Confirm code: ${authorization.userCode}`);
    const opened = openBrowser(authorization.verificationUriComplete);
    console.log(opened ? "Opening your browser…" : `Open this URL in your browser:\n${authorization.verificationUriComplete}`);
    if (opened) console.log(`If it did not open, visit:\n${authorization.verificationUriComplete}`);
    console.log("Waiting for browser authorization…");

    const deadline = Date.now() + (authorization.expiresIn ?? 600) * 1_000;
    const interval = Math.max(1, authorization.interval ?? 2) * 1_000;
    let pair: { agentToken: string; connectionId: string; projectId: string; projectName?: string } | undefined;
    while (Date.now() < deadline) {
      const tokenResponse = await fetch(`${baseEndpoint}/api/v1/machines/authorize/token`, {
        method: "POST",
        headers: { "content-type": "application/json", "user-agent": `tokly-machine/${VERSION}` },
        body: JSON.stringify({ deviceCode: authorization.deviceCode }),
      });
      const token = await tokenResponse.json() as { error?: string; agentToken?: string; connectionId?: string; projectId?: string; projectName?: string };
      if (tokenResponse.ok && token.agentToken && token.connectionId && token.projectId) {
        pair = { agentToken: token.agentToken, connectionId: token.connectionId, projectId: token.projectId, projectName: token.projectName };
        break;
      }
      if (token.error !== "authorization_pending") throw new Error(token.error === "expired_token" ? "Browser authorization expired. Run \"tokly init\" again." : token.error || `Authorization failed with HTTP ${tokenResponse.status}.`);
      await new Promise((resolve) => setTimeout(resolve, interval));
    }
    if (!pair) throw new Error("Browser authorization expired. Run \"tokly init\" again.");
    console.log(`Authorized for ${pair.projectName ?? "Tokly project"}. Continuing setup…`);
    const cliPath = fileURLToPath(import.meta.url);
    let backups: Record<string, string | null> = {};
    let serviceInstalled = false;
    try {
      storeCredential(pair.agentToken);
      backups = await applyToolConfigs(selected, port, cliPath);
      await saveConfig({ endpoint: baseEndpoint, connectionId: pair.connectionId, projectId: pair.projectId, projectName: pair.projectName ?? "Tokly project", port, selectedTools: selected, backups });
      await installService(cliPath);
      serviceInstalled = true;
      if (!startService()) throw new Error("The collector service could not be started.");
      let collectorReady = false;
      for (let attempt = 0; attempt < 20; attempt += 1) {
        try { if ((await fetch(`http://127.0.0.1:${port}/health`, { signal: AbortSignal.timeout(250) })).ok) { collectorReady = true; break; } } catch { /* starting */ }
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
      if (!collectorReady) throw new Error("The collector service did not become ready.");
      const heartbeat = await fetch(`${baseEndpoint}/api/v1/machines/heartbeat`, { method: "POST", headers: { authorization: `Bearer ${pair.agentToken}`, "content-type": "application/json" }, body: JSON.stringify({ selectedTools: selected, collectorPort: port }) });
      if (!heartbeat.ok) throw new Error("The first heartbeat could not be verified.");
    } catch (error) { await fetch(`${baseEndpoint}/api/v1/machines/heartbeat`, { method: "DELETE", headers: { authorization: `Bearer ${pair.agentToken}` } }).catch(() => undefined); if (serviceInstalled) await removeService(); await restoreToolConfigs(backups); deleteCredential(); await deleteConfig(); throw error; }
    console.log(`\nConnected ${machineName()} to ${pair.projectName}. Collector listening on 127.0.0.1:${port}.`);
  } finally { rl.close(); }
}

async function status() {
  try { const config = await loadConfig(); readCredential(); let healthy = false; try { healthy = (await fetch(`http://127.0.0.1:${config.port}/health`, { signal: AbortSignal.timeout(500) })).ok; } catch { /* offline */ }
    console.log(`Project: ${config.projectName}\nCollector: ${healthy ? "running" : "stopped"}\nAddress: 127.0.0.1:${config.port}\nTools: ${config.selectedTools.join(", ")}\nCredential: secured by an encrypted credential store`);
  } catch { console.log(`Tokly is not connected. Run \"tokly init\".\nConfig: ${configPath()}`); process.exitCode = 1; }
}
async function tools() { const found = await detectTools(); console.table(found.map((item) => ({ tool: item.label, version: item.version ?? "—", status: item.status, fidelity: item.fidelity, conflict: item.conflict ?? "" }))); }
async function disconnect() { const config = await loadConfig(); const rl = terminal(); try { const answer = await rl.question(`Disconnect ${machineName()} from ${config.projectName} and restore Tokly-owned config changes? [y/N] `); if (!/^y(es)?$/i.test(answer.trim())) return; const token = readCredential(); await fetch(`${config.endpoint}/api/v1/machines/heartbeat`, { method: "DELETE", headers: { authorization: `Bearer ${token}` } }).catch(() => undefined); await removeService(); await restoreToolConfigs(config.backups); deleteCredential(); await deleteConfig(); console.log("Tokly disconnected. Only Tokly-owned changes were removed."); } finally { rl.close(); } }
async function hook(tool: string) { if (tool !== "cursor" && tool !== "codex") throw new Error("Unknown hook."); const chunks: Buffer[] = []; if (!process.argv[4]) for await (const chunk of stdin) chunks.push(Buffer.from(chunk)); const body = JSON.parse(process.argv[4] || Buffer.concat(chunks).toString("utf8") || "{}"); await sendHook(tool, sanitizeActivity(tool, body)); }

async function main() {
  const command = process.argv[2];
  if (!command || command === "--help" || command === "help") return console.log(help);
  if (command === "--version" || command === "version") return console.log(VERSION);
  if (command === "init") return init(); if (command === "status") return status(); if (command === "tools") return tools();
  if (command === "start") { if (!startService()) throw new Error("Could not start the Tokly service."); return console.log("Tokly collector started."); }
  if (command === "stop") { if (!stopService()) throw new Error("Could not stop the Tokly service."); return console.log("Tokly collector stopped."); }
  if (command === "disconnect") return disconnect(); if (command === "collector") return runCollector(); if (command === "hook") return hook(process.argv[3] ?? "");
  throw new Error(`Unknown command: ${command}\n\n${help}`);
}

main().catch((error) => { console.error(`Tokly: ${error instanceof Error ? error.message : "Unexpected error."}`); process.exitCode = 1; });
