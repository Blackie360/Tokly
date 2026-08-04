import type { UsageEvent, UsageProvider } from "./types.js";

type BaseAdapterInput = Pick<UsageEvent, "model" | "dimensions" | "latencyMs" | "status">;

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
