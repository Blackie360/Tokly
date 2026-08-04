import "server-only";

import { and, eq, gte, isNull, lt, or, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { setTenant, withTenant } from "@/lib/db/tenant";
import {
  alertDeliveries,
  budgets,
  hourlyUsage,
  modelPrices,
  notifications,
  projectApiKeys,
  rateLimitBuckets,
  usageEvents,
} from "@/lib/db/schema";
import { escapeHtml, sendEmail } from "@/lib/email";
import { projectKeyMatches } from "@/lib/security/api-keys";
import { crossedBudgetThresholds } from "./budgets";
import { calculateEventCost } from "./pricing";
import type { UsageBatchInput } from "./schema";

const DEFAULT_EVENTS_PER_MINUTE = 10_000;

function startOfHour(value: Date) {
  const date = new Date(value);
  date.setUTCMinutes(0, 0, 0);
  return date;
}

function startOfMonth(value: Date) {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), 1));
}

export async function consumeRateLimit(apiKeyId: string, weight: number) {
  const windowStart = startOfHour(new Date());
  windowStart.setUTCMinutes(new Date().getUTCMinutes(), 0, 0);
  const bucketKey = `${apiKeyId}:${windowStart.toISOString()}`;
  const rows = await getDb()
    .insert(rateLimitBuckets)
    .values({ bucketKey, apiKeyId, windowStart, eventCount: weight })
    .onConflictDoUpdate({
      target: rateLimitBuckets.bucketKey,
      set: {
        eventCount: sql`${rateLimitBuckets.eventCount} + ${weight}`,
        updatedAt: new Date(),
      },
    })
    .returning({ eventCount: rateLimitBuckets.eventCount });

  const limit = Number(process.env.INGEST_EVENTS_PER_MINUTE ?? DEFAULT_EVENTS_PER_MINUTE);
  return (rows[0]?.eventCount ?? weight) <= limit;
}

export async function authenticateProjectKey(rawKey: string) {
  const keyHash = (await import("@/lib/security/api-keys")).hashProjectKey(rawKey);
  const rows = await getDb()
    .select()
    .from(projectApiKeys)
    .where(and(eq(projectApiKeys.keyHash, keyHash), isNull(projectApiKeys.revokedAt)))
    .limit(1);
  const key = rows[0];
  if (!key || !projectKeyMatches(rawKey, key.keyHash)) return null;
  return key;
}

async function createBudgetAlerts(
  tx: Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0],
  organizationId: string,
  now: Date,
) {
  const periodStart = startOfMonth(now);
  const budgetRows = await tx
    .select()
    .from(budgets)
    .where(and(eq(budgets.organizationId, organizationId), eq(budgets.active, true)));

  for (const budget of budgetRows) {
    const spendRows = await tx
      .select({ spend: sql<string>`coalesce(sum(${hourlyUsage.costUsd}), 0)` })
      .from(hourlyUsage)
      .where(
        and(
          eq(hourlyUsage.organizationId, organizationId),
          gte(hourlyUsage.hour, periodStart),
          budget.projectId ? eq(hourlyUsage.projectId, budget.projectId) : undefined,
        ),
      );
    const spend = Number(spendRows[0]?.spend ?? 0);
    const limit = Number(budget.monthlyLimitUsd);
    if (!Number.isFinite(limit) || limit <= 0) continue;

    for (const threshold of crossedBudgetThresholds(spend, limit, budget.thresholds)) {
      const title = `${budget.name} reached ${threshold}%`;
      const body = `$${spend.toFixed(2)} of the $${limit.toFixed(2)} monthly budget has been used.`;
      const inserted = await tx
        .insert(notifications)
        .values({
          organizationId,
          budgetId: budget.id,
          periodStart,
          threshold,
          title,
          body,
        })
        .onConflictDoNothing()
        .returning({ id: notifications.id });

      if (inserted[0]) {
        await tx
          .insert(alertDeliveries)
          .values({
            organizationId,
            notificationId: inserted[0].id,
            recipient: budget.alertEmail,
          })
          .onConflictDoNothing();
      }
    }
  }
}

export async function ingestUsage(rawKey: string, batch: UsageBatchInput) {
  const key = await authenticateProjectKey(rawKey);
  if (!key) return { status: "unauthorized" as const };
  const result = await ingestUsageForIdentity(key, batch);
  if (result.status === "ok") {
    await getDb().update(projectApiKeys).set({ lastUsedAt: new Date() }).where(eq(projectApiKeys.id, key.id));
  }
  return result;
}

export async function ingestUsageForIdentity(
  key: { id: string; organizationId: string; projectId: string; environment: string },
  batch: UsageBatchInput,
) {
  if (!(await consumeRateLimit(key.id, batch.events.length))) {
    return { status: "rate_limited" as const };
  }

  const catalog = await getDb().select().from(modelPrices);
  const result = await getDb().transaction(async (tx) => {
    await setTenant(tx, key.organizationId);
    let accepted = 0;
    let duplicates = 0;

    for (const event of batch.events) {
      const occurredAt = new Date(event.timestamp);
      const cost = calculateEventCost(event, catalog);
      const usage = {
        inputTokens: event.usage.inputTokens ?? 0,
        outputTokens: event.usage.outputTokens ?? 0,
        cacheReadTokens: event.usage.cacheReadTokens ?? 0,
        cacheWriteTokens: event.usage.cacheWriteTokens ?? 0,
        reasoningTokens: event.usage.reasoningTokens ?? 0,
      };
      const inserted = await tx
        .insert(usageEvents)
        .values({
          organizationId: key.organizationId,
          projectId: key.projectId,
          eventId: event.id,
          occurredAt,
          provider: event.provider,
          model: event.model,
          operation: event.operation,
          status: event.status,
          ...usage,
          costUsd: cost.costUsd,
          costSource: cost.source,
          latencyMs: event.latencyMs,
          environment: event.dimensions?.environment ?? key.environment,
          feature: event.dimensions?.feature,
          endUserId: event.dimensions?.endUserId,
          traceId: event.dimensions?.traceId,
          sessionId: event.dimensions?.sessionId,
        })
        .onConflictDoNothing()
        .returning({ id: usageEvents.id });

      if (!inserted[0]) {
        duplicates += 1;
        continue;
      }

      accepted += 1;
      const costValue = cost.costUsd ?? "0";
      const environment = event.dimensions?.environment ?? key.environment;
      const feature = event.dimensions?.feature ?? "";
      await tx
        .insert(hourlyUsage)
        .values({
          organizationId: key.organizationId,
          projectId: key.projectId,
          hour: startOfHour(occurredAt),
          provider: event.provider,
          model: event.model,
          operation: event.operation,
          environment,
          feature,
          requestCount: 1,
          errorCount: event.status === "error" ? 1 : 0,
          ...usage,
          costUsd: costValue,
          unpricedCount: cost.source === "unpriced" ? 1 : 0,
          totalLatencyMs: event.latencyMs ?? 0,
          latencySampleCount: event.latencyMs === undefined ? 0 : 1,
        })
        .onConflictDoUpdate({
          target: [
            hourlyUsage.projectId,
            hourlyUsage.hour,
            hourlyUsage.provider,
            hourlyUsage.model,
            hourlyUsage.operation,
            hourlyUsage.environment,
            hourlyUsage.feature,
          ],
          set: {
            requestCount: sql`${hourlyUsage.requestCount} + 1`,
            errorCount: sql`${hourlyUsage.errorCount} + ${event.status === "error" ? 1 : 0}`,
            inputTokens: sql`${hourlyUsage.inputTokens} + ${usage.inputTokens}`,
            outputTokens: sql`${hourlyUsage.outputTokens} + ${usage.outputTokens}`,
            cacheReadTokens: sql`${hourlyUsage.cacheReadTokens} + ${usage.cacheReadTokens}`,
            cacheWriteTokens: sql`${hourlyUsage.cacheWriteTokens} + ${usage.cacheWriteTokens}`,
            reasoningTokens: sql`${hourlyUsage.reasoningTokens} + ${usage.reasoningTokens}`,
            costUsd: sql`${hourlyUsage.costUsd} + ${costValue}::numeric`,
            unpricedCount: sql`${hourlyUsage.unpricedCount} + ${cost.source === "unpriced" ? 1 : 0}`,
            totalLatencyMs: sql`${hourlyUsage.totalLatencyMs} + ${event.latencyMs ?? 0}`,
            latencySampleCount: sql`${hourlyUsage.latencySampleCount} + ${event.latencyMs === undefined ? 0 : 1}`,
          },
        });
    }

    if (accepted > 0) await createBudgetAlerts(tx, key.organizationId, new Date());
    return { accepted, duplicates };
  });

  return { status: "ok" as const, organizationId: key.organizationId, ...result };
}

export async function deliverPendingAlerts(organizationId: string) {
  return withTenant(organizationId, async (tx) => {
    const pending = await tx
      .select({
        id: alertDeliveries.id,
        recipient: alertDeliveries.recipient,
        title: notifications.title,
        body: notifications.body,
      })
      .from(alertDeliveries)
      .innerJoin(notifications, eq(notifications.id, alertDeliveries.notificationId))
      .where(
        and(
          eq(alertDeliveries.organizationId, organizationId),
          or(eq(alertDeliveries.status, "pending"), eq(alertDeliveries.status, "failed")),
          lt(alertDeliveries.attempts, 5),
        ),
      )
      .limit(20);

    for (const delivery of pending) {
      try {
        const outcome = await sendEmail({
          to: delivery.recipient,
          subject: delivery.title,
          html: `<p>${escapeHtml(delivery.body)}</p><p>Open Tokly to inspect the usage behind this alert.</p>`,
        });
        await tx
          .update(alertDeliveries)
          .set({
            status: outcome.skipped ? "pending" : "sent",
            attempts: sql`${alertDeliveries.attempts} + 1`,
            sentAt: outcome.skipped ? null : new Date(),
            lastError: outcome.skipped ? "RESEND_API_KEY is not configured" : null,
          })
          .where(eq(alertDeliveries.id, delivery.id));
      } catch (error) {
        await tx
          .update(alertDeliveries)
          .set({
            status: "failed",
            attempts: sql`${alertDeliveries.attempts} + 1`,
            lastError: error instanceof Error ? error.message.slice(0, 500) : "Unknown email error",
          })
          .where(eq(alertDeliveries.id, delivery.id));
      }
    }
  });
}
