import { z } from "zod";
import { usageEventSchema } from "@/lib/usage/schema";

export const machineTools = ["cursor", "codex", "claude_code", "gemini_cli", "ollama"] as const;

export const pairMachineSchema = z.object({
  code: z.string().trim().regex(/^TLY-[A-Z2-9]{4}-[A-Z2-9]{4}$/),
  deviceName: z.string().trim().min(1).max(100),
  platform: z.enum(["linux", "darwin", "win32"]),
  clientVersion: z.string().trim().min(1).max(32),
  selectedTools: z.array(z.enum(machineTools)).max(machineTools.length),
}).strict();

export const startMachineAuthorizationSchema = pairMachineSchema.omit({ code: true });

export const pollMachineAuthorizationSchema = z.object({
  deviceCode: z.string().regex(/^[A-Za-z0-9_-]{40,64}$/),
}).strict();

export const heartbeatSchema = z.object({
  selectedTools: z.array(z.enum(machineTools)).max(machineTools.length).optional(),
  collectorPort: z.number().int().min(4318).max(4328).optional(),
}).strict();

export const machineUsageBatchSchema = z.object({
  events: z.array(usageEventSchema.refine((event) => event.provider === "anthropic" || event.provider === "google", {
    message: "Machine usage accepts Claude and Gemini exact usage only.",
  })).min(1).max(100),
}).strict();

export const activityBatchSchema = z.object({
  events: z.array(z.object({
    id: z.string().trim().min(1).max(128),
    timestamp: z.iso.datetime({ offset: true }),
    tool: z.enum(["cursor", "codex", "ollama"]),
    eventType: z.string().trim().min(1).max(64),
    model: z.string().trim().min(1).max(160).optional(),
    status: z.enum(["success", "error", "started", "stopped"]).optional(),
    durationMs: z.number().int().nonnegative().max(86_400_000).optional(),
    sessionId: z.string().trim().min(1).max(128).optional(),
  }).strict()).min(1).max(100),
}).strict();
