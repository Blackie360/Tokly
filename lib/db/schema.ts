import { relations, sql } from "drizzle-orm";
import {
  bigint,
  type AnyPgColumn,
  boolean,
  check,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgPolicy,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const now = () => timestamp("created_at", { withTimezone: true }).defaultNow().notNull();

// Better Auth core tables.
export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").default(false).notNull(),
  image: text("image"),
  createdAt: now(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const session = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    token: text("token").notNull().unique(),
    createdAt: now(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    activeOrganizationId: text("active_organization_id"),
  },
  (table) => [index("session_user_idx").on(table.userId)],
);

export const account = pgTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
    scope: text("scope"),
    password: text("password"),
    createdAt: now(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("account_user_idx").on(table.userId)],
);

export const verification = pgTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: now(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("verification_identifier_idx").on(table.identifier)],
);

// Better Auth organization plugin tables.
export const organization = pgTable("organization", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  logo: text("logo"),
  metadata: text("metadata"),
  createdAt: now(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

export const member = pgTable(
  "member",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    role: text("role").default("member").notNull(),
    createdAt: now(),
  },
  (table) => [
    uniqueIndex("member_org_user_unique").on(table.organizationId, table.userId),
    index("member_user_idx").on(table.userId),
  ],
);

export const invitation = pgTable(
  "invitation",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    role: text("role").notNull(),
    status: text("status").default("pending").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    createdAt: now(),
    inviterId: text("inviter_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (table) => [index("invitation_org_email_idx").on(table.organizationId, table.email)],
);

export const providerEnum = pgEnum("usage_provider", [
  "openai",
  "anthropic",
  "google",
  "vercel",
  "other",
]);
export const operationEnum = pgEnum("usage_operation", ["generation", "embedding"]);
export const usageStatusEnum = pgEnum("usage_status", ["success", "error"]);
export const keyEnvironmentEnum = pgEnum("key_environment", ["live", "test"]);
export const budgetScopeEnum = pgEnum("budget_scope", ["organization", "project"]);
export const deliveryStatusEnum = pgEnum("delivery_status", ["pending", "sent", "failed"]);

const tenantPolicy = (name: string, organizationId: AnyPgColumn) =>
  pgPolicy(name, {
    for: "all",
    to: "public",
    using: sql`${organizationId} = nullif(current_setting('app.current_organization_id', true), '')::uuid`,
    withCheck: sql`${organizationId} = nullif(current_setting('app.current_organization_id', true), '')::uuid`,
  });

export const projects = pgTable(
  "projects",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id").notNull(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    createdAt: now(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("projects_org_slug_unique").on(table.organizationId, table.slug),
    index("projects_org_idx").on(table.organizationId),
    tenantPolicy("projects_tenant_isolation", table.organizationId),
  ],
).enableRLS();

// Deliberately not RLS-protected: this minimal lookup table is used to resolve
// a high-entropy write key before the request's tenant is known.
export const projectApiKeys = pgTable(
  "project_api_keys",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id").notNull(),
    projectId: uuid("project_id").notNull(),
    name: text("name").notNull(),
    environment: keyEnvironmentEnum("environment").default("live").notNull(),
    keyPrefix: text("key_prefix").notNull(),
    keyHash: text("key_hash").notNull().unique(),
    createdAt: now(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (table) => [
    index("project_api_keys_project_idx").on(table.projectId),
    index("project_api_keys_org_idx").on(table.organizationId),
  ],
);

export const usageEvents = pgTable(
  "usage_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id").notNull(),
    projectId: uuid("project_id").notNull(),
    eventId: text("event_id").notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    receivedAt: timestamp("received_at", { withTimezone: true }).defaultNow().notNull(),
    provider: providerEnum("provider").notNull(),
    model: text("model").notNull(),
    operation: operationEnum("operation").notNull(),
    status: usageStatusEnum("status").default("success").notNull(),
    inputTokens: bigint("input_tokens", { mode: "number" }).default(0).notNull(),
    outputTokens: bigint("output_tokens", { mode: "number" }).default(0).notNull(),
    cacheReadTokens: bigint("cache_read_tokens", { mode: "number" }).default(0).notNull(),
    cacheWriteTokens: bigint("cache_write_tokens", { mode: "number" }).default(0).notNull(),
    reasoningTokens: bigint("reasoning_tokens", { mode: "number" }).default(0).notNull(),
    costUsd: numeric("cost_usd", { precision: 20, scale: 10 }),
    costSource: text("cost_source").notNull(),
    latencyMs: integer("latency_ms"),
    environment: text("environment"),
    feature: text("feature"),
    endUserId: text("end_user_id"),
    traceId: text("trace_id"),
    sessionId: text("session_id"),
  },
  (table) => [
    uniqueIndex("usage_events_project_event_unique").on(table.projectId, table.eventId),
    index("usage_events_org_occurred_idx").on(table.organizationId, table.occurredAt),
    index("usage_events_project_occurred_idx").on(table.projectId, table.occurredAt),
    check("usage_events_nonnegative_tokens", sql`${table.inputTokens} >= 0 and ${table.outputTokens} >= 0 and ${table.cacheReadTokens} >= 0 and ${table.cacheWriteTokens} >= 0 and ${table.reasoningTokens} >= 0`),
    tenantPolicy("usage_events_tenant_isolation", table.organizationId),
  ],
).enableRLS();

export const hourlyUsage = pgTable(
  "hourly_usage",
  {
    organizationId: uuid("organization_id").notNull(),
    projectId: uuid("project_id").notNull(),
    hour: timestamp("hour", { withTimezone: true }).notNull(),
    provider: providerEnum("provider").notNull(),
    model: text("model").notNull(),
    operation: operationEnum("operation").notNull(),
    environment: text("environment").default("").notNull(),
    feature: text("feature").default("").notNull(),
    requestCount: bigint("request_count", { mode: "number" }).default(0).notNull(),
    errorCount: bigint("error_count", { mode: "number" }).default(0).notNull(),
    inputTokens: bigint("input_tokens", { mode: "number" }).default(0).notNull(),
    outputTokens: bigint("output_tokens", { mode: "number" }).default(0).notNull(),
    cacheReadTokens: bigint("cache_read_tokens", { mode: "number" }).default(0).notNull(),
    cacheWriteTokens: bigint("cache_write_tokens", { mode: "number" }).default(0).notNull(),
    reasoningTokens: bigint("reasoning_tokens", { mode: "number" }).default(0).notNull(),
    costUsd: numeric("cost_usd", { precision: 20, scale: 10 }).default("0").notNull(),
    unpricedCount: bigint("unpriced_count", { mode: "number" }).default(0).notNull(),
    totalLatencyMs: bigint("total_latency_ms", { mode: "number" }).default(0).notNull(),
  },
  (table) => [
    primaryKey({
      name: "hourly_usage_dimensions_pk",
      columns: [table.projectId, table.hour, table.provider, table.model, table.operation, table.environment, table.feature],
    }),
    index("hourly_usage_org_hour_idx").on(table.organizationId, table.hour),
    tenantPolicy("hourly_usage_tenant_isolation", table.organizationId),
  ],
).enableRLS();

export const modelPrices = pgTable(
  "model_prices",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    provider: providerEnum("provider").notNull(),
    model: text("model").notNull(),
    effectiveFrom: timestamp("effective_from", { withTimezone: true }).notNull(),
    effectiveTo: timestamp("effective_to", { withTimezone: true }),
    inputPerMillionUsd: numeric("input_per_million_usd", { precision: 14, scale: 6 }).default("0").notNull(),
    outputPerMillionUsd: numeric("output_per_million_usd", { precision: 14, scale: 6 }).default("0").notNull(),
    cacheReadPerMillionUsd: numeric("cache_read_per_million_usd", { precision: 14, scale: 6 }).default("0").notNull(),
    cacheWritePerMillionUsd: numeric("cache_write_per_million_usd", { precision: 14, scale: 6 }).default("0").notNull(),
    sourceUrl: text("source_url").notNull(),
    createdAt: now(),
  },
  (table) => [
    uniqueIndex("model_prices_effective_unique").on(table.provider, table.model, table.effectiveFrom),
    index("model_prices_lookup_idx").on(table.provider, table.model, table.effectiveFrom),
  ],
);

export const budgets = pgTable(
  "budgets",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id").notNull(),
    projectId: uuid("project_id"),
    name: text("name").notNull(),
    scope: budgetScopeEnum("scope").notNull(),
    monthlyLimitUsd: numeric("monthly_limit_usd", { precision: 14, scale: 2 }).notNull(),
    thresholds: jsonb("thresholds").$type<number[]>().default([50, 80, 100]).notNull(),
    alertEmail: text("alert_email").notNull(),
    active: boolean("active").default(true).notNull(),
    createdAt: now(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("budgets_org_idx").on(table.organizationId),
    tenantPolicy("budgets_tenant_isolation", table.organizationId),
  ],
).enableRLS();

export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id").notNull(),
    budgetId: uuid("budget_id").notNull(),
    periodStart: timestamp("period_start", { withTimezone: true }).notNull(),
    threshold: integer("threshold").notNull(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    createdAt: now(),
    readAt: timestamp("read_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("notifications_budget_period_threshold_unique").on(table.budgetId, table.periodStart, table.threshold),
    index("notifications_org_created_idx").on(table.organizationId, table.createdAt),
    tenantPolicy("notifications_tenant_isolation", table.organizationId),
  ],
).enableRLS();

export const alertDeliveries = pgTable(
  "alert_deliveries",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id").notNull(),
    notificationId: uuid("notification_id").notNull(),
    recipient: text("recipient").notNull(),
    status: deliveryStatusEnum("status").default("pending").notNull(),
    attempts: integer("attempts").default(0).notNull(),
    lastError: text("last_error"),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    createdAt: now(),
  },
  (table) => [
    uniqueIndex("alert_delivery_notification_recipient_unique").on(table.notificationId, table.recipient),
    index("alert_delivery_pending_idx").on(table.organizationId, table.status),
    tenantPolicy("alert_deliveries_tenant_isolation", table.organizationId),
  ],
).enableRLS();

export const rateLimitBuckets = pgTable("rate_limit_buckets", {
  bucketKey: text("bucket_key").primaryKey(),
  apiKeyId: uuid("api_key_id").notNull(),
  windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
  eventCount: integer("event_count").default(0).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const organizationRelations = relations(organization, ({ many }) => ({
  members: many(member),
  invitations: many(invitation),
}));

export const memberRelations = relations(member, ({ one }) => ({
  organization: one(organization, { fields: [member.organizationId], references: [organization.id] }),
  user: one(user, { fields: [member.userId], references: [user.id] }),
}));

export type Project = typeof projects.$inferSelect;
export type UsageEvent = typeof usageEvents.$inferSelect;
export type ModelPrice = typeof modelPrices.$inferSelect;
export type Budget = typeof budgets.$inferSelect;
