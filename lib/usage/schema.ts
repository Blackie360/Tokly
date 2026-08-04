import { z } from "zod";

const tokenCount = z.number().int().nonnegative().safe();
const boundedDimension = z.string().trim().min(1).max(128);

export const usageEventSchema = z
  .object({
    id: z.string().trim().min(1).max(128),
    timestamp: z.iso.datetime({ offset: true }),
    provider: z.enum(["openai", "anthropic", "google", "vercel", "other"]),
    model: z.string().trim().min(1).max(160),
    operation: z.enum(["generation", "embedding"]),
    usage: z
      .object({
        inputTokens: tokenCount.optional(),
        outputTokens: tokenCount.optional(),
        cacheReadTokens: tokenCount.optional(),
        cacheWriteTokens: tokenCount.optional(),
        reasoningTokens: tokenCount.optional(),
      })
      .strict()
      .refine((usage) => Object.values(usage).some((value) => value !== undefined), {
        message: "At least one token count is required.",
      }),
    costUsd: z
      .string()
      .regex(/^\d{1,10}(?:\.\d{1,10})?$/, "costUsd must be a non-negative decimal string")
      .optional(),
    latencyMs: z.number().int().nonnegative().max(86_400_000).optional(),
    status: z.enum(["success", "error"]).default("success"),
    dimensions: z
      .object({
        environment: boundedDimension.optional(),
        feature: boundedDimension.optional(),
        endUserId: boundedDimension.optional(),
        traceId: boundedDimension.optional(),
        sessionId: boundedDimension.optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

export const usageBatchSchema = z
  .object({
    events: z.array(usageEventSchema).min(1).max(100),
  })
  .strict();

export type UsageEventInput = z.infer<typeof usageEventSchema>;
export type UsageBatchInput = z.infer<typeof usageBatchSchema>;
