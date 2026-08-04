import { describe, expect, it, vi } from "vitest";
import { Tokly } from "@/packages/sdk/src/index";
import { fromOllamaResponse, fromOpenRouterResponse } from "@/packages/sdk/src/adapters";

const apiKey = `tok_test_${"a".repeat(43)}`;
const event = {
  provider: "openai" as const,
  model: "model-a",
  operation: "generation" as const,
  usage: { inputTokens: 10, outputTokens: 2 },
};

describe("TypeScript SDK", () => {
  it("buffers normalized events and flushes them to ingestion", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 202 }));
    const meter = new Tokly({ apiKey, endpoint: "https://meter.test/", fetch: fetchMock, flushAt: 100 });
    const id = meter.capture(event);
    await meter.shutdown();

    expect(id).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledOnce();
    const [, init] = fetchMock.mock.calls[0]!;
    const payload = JSON.parse(String(init?.body));
    expect(payload.events[0]).toMatchObject({ id, provider: "openai", status: "success" });
  });

  it("normalizes OpenRouter token, cache, reasoning, and cost usage", () => {
    expect(fromOpenRouterResponse({
      model: "anthropic/claude-sonnet-4",
      usage: {
        prompt_tokens: 194,
        completion_tokens: 20,
        prompt_tokens_details: { cached_tokens: 40, cache_write_tokens: 10 },
        completion_tokens_details: { reasoning_tokens: 7 },
        cost: 0.0095,
      },
    })).toEqual({
      provider: "openrouter",
      model: "anthropic/claude-sonnet-4",
      operation: "generation",
      usage: {
        inputTokens: 194,
        outputTokens: 20,
        cacheReadTokens: 40,
        cacheWriteTokens: 10,
        reasoningTokens: 7,
      },
      costUsd: "0.0095",
      dimensions: undefined,
      latencyMs: undefined,
      status: undefined,
    });
  });

  it("normalizes Ollama tokens and converts nanoseconds to milliseconds", () => {
    expect(fromOllamaResponse({
      model: "gemma3",
      prompt_eval_count: 11,
      eval_count: 18,
      total_duration: 174_560_334,
    })).toEqual({
      provider: "ollama",
      model: "gemma3",
      operation: "generation",
      usage: { inputTokens: 11, outputTokens: 18 },
      dimensions: undefined,
      latencyMs: 175,
      status: undefined,
    });
  });

  it("does not retry permanent client errors", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 400 }));
    const meter = new Tokly({ apiKey, endpoint: "https://meter.test", fetch: fetchMock, flushAt: 100, maxRetries: 3 });
    meter.capture(event);
    await expect(meter.flush()).rejects.toThrow("HTTP 400");
    expect(fetchMock).toHaveBeenCalledOnce();
    await meter.shutdown().catch(() => undefined);
  });
});
