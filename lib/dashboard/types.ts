export type DashboardSeriesPoint = {
  label: string;
  input: number;
  output: number;
  cache: number;
  cost: number;
};

export type DashboardData = {
  updatedAt: string;
  metrics: {
    spend: number;
    monthSpend: number;
    tokens: number;
    requests: number;
    cacheSavings: number;
    budgetUsed: number;
    errorRate: number;
    averageLatencyMs: number | null;
    pricedCoverage: number;
  };
  series: DashboardSeriesPoint[];
  models: Array<{
    model: string;
    provider: string;
    requests: number;
    tokens: number;
    cost: number;
    share: number;
  }>;
  recent: Array<{
    id: string;
    occurredAt: string;
    project: string;
    provider: string;
    model: string;
    feature: string;
    tokens: number;
    cost: number | null;
    costSource: string;
    latencyMs: number | null;
    status: "success" | "error";
  }>;
  projects: Array<{ id: string; name: string; slug: string }>;
  budgets: Array<{
    id: string;
    name: string;
    scope: string;
    projectId: string | null;
    limit: number;
    spent: number;
    alertEmail: string;
  }>;
  notifications: Array<{ id: string; title: string; body: string; createdAt: string }>;
};
