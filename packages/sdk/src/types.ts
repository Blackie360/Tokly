export type UsageProvider = "openai" | "anthropic" | "google" | "vercel" | "openrouter" | "ollama" | "other";
export type UsageOperation = "generation" | "embedding";

export type UsageEvent = {
  id?: string;
  timestamp?: string;
  provider: UsageProvider;
  model: string;
  operation: UsageOperation;
  usage: {
    inputTokens?: number;
    outputTokens?: number;
    cacheReadTokens?: number;
    cacheWriteTokens?: number;
    reasoningTokens?: number;
  };
  costUsd?: string;
  latencyMs?: number;
  status?: "success" | "error";
  dimensions?: {
    environment?: string;
    feature?: string;
    endUserId?: string;
    traceId?: string;
    sessionId?: string;
  };
};

export type ToklyOptions = {
  apiKey: string;
  endpoint?: string;
  flushAt?: number;
  flushIntervalMs?: number;
  maxRetries?: number;
  fetch?: typeof globalThis.fetch;
};
