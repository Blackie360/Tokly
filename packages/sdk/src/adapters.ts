import type { UsageEvent, UsageProvider } from "./types.js";

type BaseAdapterInput = Pick<UsageEvent, "model" | "dimensions" | "latencyMs" | "status">;

function formatCostUsd(value: number | string | undefined) {
  if (value === undefined) return undefined;
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) return undefined;
  return numeric.toFixed(10).replace(/0+$/, "").replace(/\.$/, "") || "0";
}

export function fromAiSdkUsage(input: BaseAdapterInput & {
  provider: UsageProvider;
  usage: {
    inputTokens?: number;
    outputTokens?: number;
    inputTokenDetails?: { cacheReadTokens?: number; cacheWriteTokens?: number };
    outputTokenDetails?: { reasoningTokens?: number };
  };
}): UsageEvent {
  return {
    provider: input.provider,
    model: input.model,
    operation: "generation",
    usage: {
      inputTokens: input.usage.inputTokens,
      outputTokens: input.usage.outputTokens,
      cacheReadTokens: input.usage.inputTokenDetails?.cacheReadTokens,
      cacheWriteTokens: input.usage.inputTokenDetails?.cacheWriteTokens,
      reasoningTokens: input.usage.outputTokenDetails?.reasoningTokens,
    },
    dimensions: input.dimensions,
    latencyMs: input.latencyMs,
    status: input.status,
  };
}

export function fromOpenAIResponse(input: BaseAdapterInput & {
  usage?: { input_tokens?: number; output_tokens?: number; input_tokens_details?: { cached_tokens?: number }; output_tokens_details?: { reasoning_tokens?: number } };
}): UsageEvent {
  return { provider: "openai", model: input.model, operation: "generation", usage: { inputTokens: input.usage?.input_tokens, outputTokens: input.usage?.output_tokens, cacheReadTokens: input.usage?.input_tokens_details?.cached_tokens, reasoningTokens: input.usage?.output_tokens_details?.reasoning_tokens }, dimensions: input.dimensions, latencyMs: input.latencyMs, status: input.status };
}

export function fromAnthropicResponse(input: BaseAdapterInput & {
  usage?: { input_tokens?: number; output_tokens?: number; cache_read_input_tokens?: number; cache_creation_input_tokens?: number };
}): UsageEvent {
  return { provider: "anthropic", model: input.model, operation: "generation", usage: { inputTokens: input.usage?.input_tokens, outputTokens: input.usage?.output_tokens, cacheReadTokens: input.usage?.cache_read_input_tokens, cacheWriteTokens: input.usage?.cache_creation_input_tokens }, dimensions: input.dimensions, latencyMs: input.latencyMs, status: input.status };
}

export function fromGeminiResponse(input: BaseAdapterInput & {
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; cachedContentTokenCount?: number; thoughtsTokenCount?: number };
}): UsageEvent {
  return { provider: "google", model: input.model, operation: "generation", usage: { inputTokens: input.usageMetadata?.promptTokenCount, outputTokens: input.usageMetadata?.candidatesTokenCount, cacheReadTokens: input.usageMetadata?.cachedContentTokenCount, reasoningTokens: input.usageMetadata?.thoughtsTokenCount }, dimensions: input.dimensions, latencyMs: input.latencyMs, status: input.status };
}

export function fromOpenRouterResponse(input: BaseAdapterInput & {
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    input_tokens_details?: { cached_tokens?: number; cache_write_tokens?: number };
    output_tokens_details?: { reasoning_tokens?: number };
    prompt_tokens?: number;
    completion_tokens?: number;
    prompt_tokens_details?: { cached_tokens?: number; cache_write_tokens?: number };
    completion_tokens_details?: { reasoning_tokens?: number };
    cost?: number | string;
  };
}): UsageEvent {
  const inputDetails = input.usage?.input_tokens_details ?? input.usage?.prompt_tokens_details;
  const outputDetails = input.usage?.output_tokens_details ?? input.usage?.completion_tokens_details;

  return {
    provider: "openrouter",
    model: input.model,
    operation: "generation",
    usage: {
      inputTokens: input.usage?.input_tokens ?? input.usage?.prompt_tokens,
      outputTokens: input.usage?.output_tokens ?? input.usage?.completion_tokens,
      cacheReadTokens: inputDetails?.cached_tokens,
      cacheWriteTokens: inputDetails?.cache_write_tokens,
      reasoningTokens: outputDetails?.reasoning_tokens,
    },
    costUsd: formatCostUsd(input.usage?.cost),
    dimensions: input.dimensions,
    latencyMs: input.latencyMs,
    status: input.status,
  };
}

export function fromOllamaResponse(input: BaseAdapterInput & {
  prompt_eval_count?: number;
  eval_count?: number;
  total_duration?: number;
}): UsageEvent {
  const reportedLatency = input.total_duration === undefined
    ? undefined
    : Math.round(input.total_duration / 1_000_000);

  return {
    provider: "ollama",
    model: input.model,
    operation: "generation",
    usage: {
      inputTokens: input.prompt_eval_count,
      outputTokens: input.eval_count,
    },
    dimensions: input.dimensions,
    latencyMs: input.latencyMs ?? reportedLatency,
    status: input.status,
  };
}
