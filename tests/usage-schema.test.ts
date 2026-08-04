import { describe, expect, it } from "vitest";
import { usageBatchSchema, usageEventSchema } from "@/lib/usage/schema";

const validEvent = {
  id: "evt_01",
  timestamp: "2026-08-04T10:00:00.000Z",
  provider: "openai" as const,
  model: "model-a",
  operation: "generation" as const,
  usage: { inputTokens: 120, outputTokens: 40 },
};

describe("usage event validation", () => {
  it("accepts the provider-neutral event contract", () => {
    expect(usageEventSchema.parse(validEvent)).toMatchObject({ status: "success" });
  });

  it.each(["openrouter", "ollama"] as const)("accepts %s as a first-class provider", (provider) => {
    expect(usageEventSchema.safeParse({ ...validEvent, provider }).success).toBe(true);
  });

  it("rejects negative token counts and unknown dimensions", () => {
    expect(usageEventSchema.safeParse({ ...validEvent, usage: { inputTokens: -1 } }).success).toBe(false);
    expect(
      usageEventSchema.safeParse({
        ...validEvent,
        dimensions: { environment: "production", prompt: "must never be accepted" },
      }).success,
    ).toBe(false);
  });

  it("rejects a whole batch when any event is invalid", () => {
    const parsed = usageBatchSchema.safeParse({
      events: [validEvent, { ...validEvent, id: "evt_02", model: "" }],
    });
    expect(parsed.success).toBe(false);
  });

  it("limits a batch to one hundred events", () => {
    const events = Array.from({ length: 101 }, (_, index) => ({ ...validEvent, id: `evt_${index}` }));
    expect(usageBatchSchema.safeParse({ events }).success).toBe(false);
  });
});
