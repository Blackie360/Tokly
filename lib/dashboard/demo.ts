import type { DashboardData } from "./types";

const values = [
  [184, 46, 98, 5.2], [201, 51, 111, 5.9], [229, 62, 124, 6.8], [217, 57, 132, 6.4],
  [263, 71, 145, 7.7], [298, 78, 166, 8.5], [312, 83, 181, 9.1], [290, 75, 173, 8.6],
  [338, 92, 205, 10.2], [361, 99, 214, 10.8], [349, 94, 209, 10.5], [402, 118, 238, 12.4],
  [437, 126, 261, 13.1], [418, 121, 250, 12.8], [463, 139, 288, 14.4], [492, 151, 304, 15.2],
  [477, 144, 298, 14.8], [529, 165, 332, 16.7], [561, 178, 351, 17.9], [548, 169, 344, 17.3],
  [602, 193, 389, 19.4], [638, 207, 412, 20.6], [621, 198, 401, 20.1], [684, 224, 438, 22.3],
];

export const demoDashboard: DashboardData = {
  updatedAt: "2026-08-04T10:42:00.000Z",
  metrics: {
    spend: 184.62,
    monthSpend: 184.62,
    tokens: 48_920_441,
    requests: 18_294,
    cacheSavings: 31.08,
    budgetUsed: 61.5,
    errorRate: 1.28,
    averageLatencyMs: 842,
    pricedCoverage: 99.4,
  },
  series: values.map(([input, output, cache, cost], index) => ({
    label: `${String(index).padStart(2, "0")}:00`,
    input: input * 1000,
    output: output * 1000,
    cache: cache * 1000,
    cost,
  })),
  models: [
    { model: "gpt-5.5", provider: "openai", requests: 8214, tokens: 22_481_902, cost: 94.28, share: 51.1 },
    { model: "claude-sonnet-5", provider: "anthropic", requests: 5021, tokens: 14_830_117, cost: 51.64, share: 28.0 },
    { model: "gemini-3.5-flash", provider: "google", requests: 4217, tokens: 10_481_422, cost: 26.91, share: 14.6 },
    { model: "gpt-5.5-mini", provider: "openai", requests: 842, tokens: 1_127_000, cost: 11.79, share: 6.3 },
  ],
  recent: [
    { id: "evt_92AQ", occurredAt: "2026-08-04T10:41:37.000Z", project: "Support copilot", provider: "openai", model: "gpt-5.5", feature: "answer-ticket", tokens: 8431, cost: 0.0382, costSource: "reported", latencyMs: 724, status: "success" },
    { id: "evt_92AP", occurredAt: "2026-08-04T10:41:21.000Z", project: "Research agent", provider: "anthropic", model: "claude-sonnet-5", feature: "source-review", tokens: 12409, cost: 0.0714, costSource: "calculated", latencyMs: 1248, status: "success" },
    { id: "evt_92AN", occurredAt: "2026-08-04T10:40:54.000Z", project: "Support copilot", provider: "google", model: "gemini-3.5-flash", feature: "classify", tokens: 1187, cost: 0.0011, costSource: "reported", latencyMs: 318, status: "success" },
    { id: "evt_92AM", occurredAt: "2026-08-04T10:40:12.000Z", project: "Document API", provider: "openai", model: "gpt-5.5-mini", feature: "extract", tokens: 0, cost: null, costSource: "unpriced", latencyMs: 8_412, status: "error" },
    { id: "evt_92AL", occurredAt: "2026-08-04T10:39:44.000Z", project: "Research agent", provider: "anthropic", model: "claude-sonnet-5", feature: "synthesis", tokens: 17523, cost: 0.1082, costSource: "calculated", latencyMs: 1_532, status: "success" },
  ],
  projects: [
    { id: "00000000-0000-4000-8000-000000000001", name: "Support copilot", slug: "support-copilot" },
    { id: "00000000-0000-4000-8000-000000000002", name: "Research agent", slug: "research-agent" },
    { id: "00000000-0000-4000-8000-000000000003", name: "Document API", slug: "document-api" },
  ],
  budgets: [
    { id: "00000000-0000-4000-8000-000000000010", name: "Platform monthly", scope: "organization", projectId: null, limit: 300, spent: 184.62, alertEmail: "ops@example.com" },
    { id: "00000000-0000-4000-8000-000000000011", name: "Research guardrail", scope: "project", projectId: "00000000-0000-4000-8000-000000000002", limit: 100, spent: 51.64, alertEmail: "research@example.com" },
  ],
  notifications: [
    { id: "notice-1", title: "Platform monthly reached 50%", body: "$150.08 of the $300.00 monthly budget has been used.", createdAt: "2026-08-01T18:32:00.000Z" },
  ],
};
