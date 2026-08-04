import { describe, expect, it, vi } from "vitest";
import { Tokly } from "@/packages/sdk/src/index";

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

  it("does not retry permanent client errors", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 400 }));
    const meter = new Tokly({ apiKey, endpoint: "https://meter.test", fetch: fetchMock, flushAt: 100, maxRetries: 3 });
    meter.capture(event);
    await expect(meter.flush()).rejects.toThrow("HTTP 400");
    expect(fetchMock).toHaveBeenCalledOnce();
    await meter.shutdown().catch(() => undefined);
  });
});
