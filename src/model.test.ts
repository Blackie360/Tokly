import { describe, it, expect } from "vitest";
import { historyExplanation, inPeriod, weekDays } from "./model";
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

describe("history explanations", () => {
  const project = {id: "p",name: "p",branch: "main",changedFiles: [],note: "",lastActivity: null,excluded: false,available: true,pinned: false,lastCommit: 1000000};
  it("distinguishes older history, no commits and unavailable folders", () => {
    expect(historyExplanation(project,7,90,3000000)).toContain("outside the 7-day");
    expect(historyExplanation({...project,lastCommit:null},7,90)).toContain("No commits");
    expect(historyExplanation({...project,available:false},7,90)).toContain("Folder unavailable");
    expect(historyExplanation(project,90,7,3000000)).toContain("outside the 7-day");
  });
});
