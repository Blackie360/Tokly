import "server-only";

import { and, desc, eq, gte, sql } from "drizzle-orm";
import { withTenant } from "@/lib/db/tenant";
import {
  budgets,
  hourlyUsage,
  notifications,
  projects,
  usageEvents,
} from "@/lib/db/schema";
import type { DashboardData, DashboardSeriesPoint } from "./types";

export type DashboardFilters = {
  days: number;
  projectId?: string;
  provider?: "openai" | "anthropic" | "google" | "vercel" | "other";
  environment?: string;
  model?: string;
  feature?: string;
  status?: "success" | "error";
};

export async function getDashboardData(
  organizationId: string,
  filters: DashboardFilters,
): Promise<DashboardData> {
  const now = new Date();
  const since = new Date(now.getTime() - filters.days * 86_400_000);
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

  return withTenant(organizationId, async (tx) => {
    const projectRows = await tx
      .select({ id: projects.id, name: projects.name, slug: projects.slug })
      .from(projects)
      .where(eq(projects.organizationId, organizationId))
      .orderBy(projects.name);

    const rollups = await tx
      .select()
      .from(hourlyUsage)
      .where(
        and(
          eq(hourlyUsage.organizationId, organizationId),
          gte(hourlyUsage.hour, since),
          filters.projectId ? eq(hourlyUsage.projectId, filters.projectId) : undefined,
          filters.provider ? eq(hourlyUsage.provider, filters.provider) : undefined,
          filters.environment ? eq(hourlyUsage.environment, filters.environment) : undefined,
          filters.model ? eq(hourlyUsage.model, filters.model) : undefined,
          filters.feature ? eq(hourlyUsage.feature, filters.feature) : undefined,
        ),
      )
      .orderBy(hourlyUsage.hour);

    const recentRows = await tx
      .select({
        id: usageEvents.eventId,
        occurredAt: usageEvents.occurredAt,
        projectId: usageEvents.projectId,
        provider: usageEvents.provider,
        model: usageEvents.model,
        feature: usageEvents.feature,
        inputTokens: usageEvents.inputTokens,
        outputTokens: usageEvents.outputTokens,
        costUsd: usageEvents.costUsd,
        status: usageEvents.status,
      })
      .from(usageEvents)
      .where(
        and(
          eq(usageEvents.organizationId, organizationId),
          gte(usageEvents.occurredAt, since),
          filters.projectId ? eq(usageEvents.projectId, filters.projectId) : undefined,
          filters.provider ? eq(usageEvents.provider, filters.provider) : undefined,
          filters.environment ? eq(usageEvents.environment, filters.environment) : undefined,
          filters.model ? eq(usageEvents.model, filters.model) : undefined,
          filters.feature ? eq(usageEvents.feature, filters.feature) : undefined,
          filters.status ? eq(usageEvents.status, filters.status) : undefined,
        ),
      )
      .orderBy(desc(usageEvents.occurredAt))
      .limit(100);

    const budgetRows = await tx
      .select()
      .from(budgets)
      .where(eq(budgets.organizationId, organizationId));
    const notificationRows = await tx
      .select()
      .from(notifications)
      .where(eq(notifications.organizationId, organizationId))
      .orderBy(desc(notifications.createdAt))
      .limit(12);

    const projectNames = new Map(projectRows.map((project) => [project.id, project.name]));
    const seriesByHour = new Map<string, DashboardSeriesPoint>();
    const modelMap = new Map<string, { model: string; provider: string; requests: number; tokens: number; cost: number }>();
    let spend = 0;
    let inputTokens = 0;
    let outputTokens = 0;
    let cacheTokens = 0;
    let requests = 0;
    let errors = 0;

    for (const row of rollups) {
      const cost = Number(row.costUsd);
      spend += cost;
      inputTokens += row.inputTokens;
      outputTokens += row.outputTokens;
      cacheTokens += row.cacheReadTokens;
      requests += row.requestCount;
      errors += row.errorCount;
      const key = row.hour.toISOString();
      const point = seriesByHour.get(key) ?? {
        label: new Intl.DateTimeFormat("en", { month: "short", day: "numeric", hour: "2-digit" }).format(row.hour),
        input: 0,
        output: 0,
        cache: 0,
        cost: 0,
      };
      point.input += row.inputTokens;
      point.output += row.outputTokens;
      point.cache += row.cacheReadTokens;
      point.cost += cost;
      seriesByHour.set(key, point);

      const modelKey = `${row.provider}:${row.model}`;
      const model = modelMap.get(modelKey) ?? { model: row.model, provider: row.provider, requests: 0, tokens: 0, cost: 0 };
      model.requests += row.requestCount;
      model.tokens += row.inputTokens + row.outputTokens;
      model.cost += cost;
      modelMap.set(modelKey, model);
    }

    const monthSpendRows = await tx
      .select({ spend: sql<string>`coalesce(sum(${hourlyUsage.costUsd}), 0)` })
      .from(hourlyUsage)
      .where(and(eq(hourlyUsage.organizationId, organizationId), gte(hourlyUsage.hour, monthStart)));
    const monthSpend = Number(monthSpendRows[0]?.spend ?? 0);
    const monthProjectSpendRows = await tx
      .select({
        projectId: hourlyUsage.projectId,
        spend: sql<string>`coalesce(sum(${hourlyUsage.costUsd}), 0)`,
      })
      .from(hourlyUsage)
      .where(and(eq(hourlyUsage.organizationId, organizationId), gte(hourlyUsage.hour, monthStart)))
      .groupBy(hourlyUsage.projectId);
    const monthProjectSpend = new Map(
      monthProjectSpendRows.map((row) => [row.projectId, Number(row.spend)]),
    );
    const organizationBudget = budgetRows.find((budget) => budget.scope === "organization");
    const budgetUsed = organizationBudget ? (monthSpend / Number(organizationBudget.monthlyLimitUsd)) * 100 : 0;

    const models = Array.from(modelMap.values())
      .toSorted((a, b) => b.cost - a.cost)
      .map((model) => ({ ...model, share: spend > 0 ? (model.cost / spend) * 100 : 0 }));

    return {
      updatedAt: new Date().toISOString(),
      metrics: {
        spend,
        monthSpend,
        tokens: inputTokens + outputTokens,
        requests,
        cacheSavings: inputTokens > 0 ? spend * (cacheTokens / inputTokens) * 0.6 : 0,
        budgetUsed,
        errorRate: requests > 0 ? (errors / requests) * 100 : 0,
      },
      series: Array.from(seriesByHour.values()),
      models,
      recent: recentRows.map((row) => ({
        id: row.id,
        occurredAt: row.occurredAt.toISOString(),
        project: projectNames.get(row.projectId) ?? "Unknown project",
        provider: row.provider,
        model: row.model,
        feature: row.feature ?? "—",
        tokens: row.inputTokens + row.outputTokens,
        cost: row.costUsd === null ? null : Number(row.costUsd),
        status: row.status,
      })),
      projects: projectRows,
      budgets: budgetRows.map((budget) => ({
        id: budget.id,
        name: budget.name,
        scope: budget.scope,
        projectId: budget.projectId,
        limit: Number(budget.monthlyLimitUsd),
        spent: budget.projectId ? monthProjectSpend.get(budget.projectId) ?? 0 : monthSpend,
        alertEmail: budget.alertEmail,
      })),
      notifications: notificationRows.map((notification) => ({
        id: notification.id,
        title: notification.title,
        body: notification.body,
        createdAt: notification.createdAt.toISOString(),
      })),
    };
  });
}
