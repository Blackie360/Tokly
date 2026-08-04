import { describe, expect, it } from "vitest";
import type { ModelPrice } from "@/lib/db/schema";
import { calculateEventCost, findPrice } from "@/lib/usage/pricing";
import { usageEventSchema } from "@/lib/usage/schema";

function price(overrides: Partial<ModelPrice> = {}): ModelPrice {
  return {
    id: "97827490-ce93-41a3-a1cc-c3b362150b29",
    provider: "openai",
    model: "model-a",
    effectiveFrom: new Date("2026-01-01T00:00:00Z"),
    effectiveTo: null,
    inputPerMillionUsd: "2.000000",
    outputPerMillionUsd: "10.000000",
    cacheReadPerMillionUsd: "0.200000",
    cacheWritePerMillionUsd: "3.000000",
    sourceUrl: "https://example.test/pricing-source",
    createdAt: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  };
}

const event = usageEventSchema.parse({
  id: "evt_price",
  timestamp: "2026-08-04T10:00:00.000Z",
  provider: "openai",
  model: "model-a",
  operation: "generation",
  usage: {
    inputTokens: 1_000_000,
    outputTokens: 500_000,
    cacheReadTokens: 400_000,
    cacheWriteTokens: 100_000,
  },
});

describe("effective-dated pricing", () => {
  it("selects the price active when the event occurred", () => {
    const old = price({ id: "7aad06a3-3637-4556-a879-30a90b411ba0", effectiveTo: new Date("2026-06-01T00:00:00Z") });
    const current = price({ id: "d791f00d-d84c-4a76-8117-aa9f1a4d87dd", effectiveFrom: new Date("2026-06-01T00:00:00Z") });
    expect(findPrice(event, [old, current])?.id).toBe(current.id);
  });

  it("prices cached input separately without double counting it", () => {
    expect(calculateEventCost(event, [price()])).toEqual({
      costUsd: "6.3800000000",
      source: "calculated",
    });
  });

  it("prefers reported provider cost and marks unknown models unpriced", () => {
    expect(calculateEventCost({ ...event, costUsd: "1.25" }, [])).toEqual({
      costUsd: "1.2500000000",
      source: "reported",
    });
    expect(calculateEventCost({ ...event, model: "unknown" }, [price()])).toEqual({
      costUsd: null,
      source: "unpriced",
    });
  });
});
