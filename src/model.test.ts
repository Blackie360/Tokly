import { describe, it, expect } from "vitest";
import { inPeriod, weekDays } from "./model";
describe("weekly boundaries", () => {
  it("uses local calendar days, including year rollover", () => {
    const days = weekDays(0, new Date(2026, 0, 2, 12));
    expect(days[0].getFullYear()).toBe(2025);
    expect(days[6].getDate()).toBe(2);
    const start = days[0].getTime() / 1000;
    expect(inPeriod(start, days)).toBe(true);
    expect(inPeriod(start - 1, days)).toBe(false);
    const end = new Date(days[6]);
    end.setDate(end.getDate() + 1);
    expect(inPeriod(end.getTime() / 1000, days)).toBe(false);
  });
});
