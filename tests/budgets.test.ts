import { describe, expect, it } from "vitest";
import { crossedBudgetThresholds } from "@/lib/usage/budgets";

describe("budget threshold transitions", () => {
  it("returns every crossed threshold in stable order", () => {
    expect(crossedBudgetThresholds(82, 100, [100, 50, 80])).toEqual([50, 80]);
  });

  it("deduplicates thresholds and rejects invalid limits", () => {
    expect(crossedBudgetThresholds(120, 100, [50, 50, 100])).toEqual([50, 100]);
    expect(crossedBudgetThresholds(10, 0, [50])).toEqual([]);
  });
});
