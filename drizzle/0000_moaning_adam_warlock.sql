CREATE TYPE "public"."budget_scope" AS ENUM('organization', 'project');--> statement-breakpoint
CREATE TYPE "public"."delivery_status" AS ENUM('pending', 'sent', 'failed');--> statement-breakpoint
CREATE TYPE "public"."key_environment" AS ENUM('live', 'test');--> statement-breakpoint
CREATE TYPE "public"."usage_operation" AS ENUM('generation', 'embedding');--> statement-breakpoint
CREATE TYPE "public"."usage_provider" AS ENUM('openai', 'anthropic', 'google', 'vercel', 'other');--> statement-breakpoint
CREATE TYPE "public"."usage_status" AS ENUM('success', 'error');--> statement-breakpoint
CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "alert_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"notification_id" uuid NOT NULL,
	"recipient" text NOT NULL,
	"status" "delivery_status" DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "alert_deliveries" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "budgets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"project_id" uuid,
	"name" text NOT NULL,
	"scope" "budget_scope" NOT NULL,
	"monthly_limit_usd" numeric(14, 2) NOT NULL,
	"thresholds" jsonb DEFAULT '[50,80,100]'::jsonb NOT NULL,
	"alert_email" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "budgets" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "hourly_usage" (
	"organization_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"hour" timestamp with time zone NOT NULL,
	"provider" "usage_provider" NOT NULL,
	"model" text NOT NULL,
	"operation" "usage_operation" NOT NULL,
	"environment" text DEFAULT '' NOT NULL,
	"feature" text DEFAULT '' NOT NULL,
	"request_count" bigint DEFAULT 0 NOT NULL,
	"error_count" bigint DEFAULT 0 NOT NULL,
	"input_tokens" bigint DEFAULT 0 NOT NULL,
	"output_tokens" bigint DEFAULT 0 NOT NULL,
	"cache_read_tokens" bigint DEFAULT 0 NOT NULL,
	"cache_write_tokens" bigint DEFAULT 0 NOT NULL,
	"reasoning_tokens" bigint DEFAULT 0 NOT NULL,
	"cost_usd" numeric(20, 10) DEFAULT '0' NOT NULL,
	"unpriced_count" bigint DEFAULT 0 NOT NULL,
	"total_latency_ms" bigint DEFAULT 0 NOT NULL,
	CONSTRAINT "hourly_usage_dimensions_pk" PRIMARY KEY("project_id","hour","provider","model","operation","environment","feature")
);
--> statement-breakpoint
ALTER TABLE "hourly_usage" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "invitation" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"email" text NOT NULL,
	"role" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"inviter_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "member" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"user_id" text NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "model_prices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" "usage_provider" NOT NULL,
	"model" text NOT NULL,
	"effective_from" timestamp with time zone NOT NULL,
	"effective_to" timestamp with time zone,
	"input_per_million_usd" numeric(14, 6) DEFAULT '0' NOT NULL,
	"output_per_million_usd" numeric(14, 6) DEFAULT '0' NOT NULL,
	"cache_read_per_million_usd" numeric(14, 6) DEFAULT '0' NOT NULL,
	"cache_write_per_million_usd" numeric(14, 6) DEFAULT '0' NOT NULL,
	"source_url" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"budget_id" uuid NOT NULL,
	"period_start" timestamp with time zone NOT NULL,
	"threshold" integer NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"read_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "notifications" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "organization" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"logo" text,
	"metadata" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "organization_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "project_api_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"name" text NOT NULL,
	"environment" "key_environment" DEFAULT 'live' NOT NULL,
	"key_prefix" text NOT NULL,
	"key_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_used_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "project_api_keys_key_hash_unique" UNIQUE("key_hash")
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "projects" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "rate_limit_buckets" (
	"bucket_key" text PRIMARY KEY NOT NULL,
	"api_key_id" uuid NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"event_count" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	"active_organization_id" text,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "usage_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"event_id" text NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"provider" "usage_provider" NOT NULL,
	"model" text NOT NULL,
	"operation" "usage_operation" NOT NULL,
	"status" "usage_status" DEFAULT 'success' NOT NULL,
	"input_tokens" bigint DEFAULT 0 NOT NULL,
	"output_tokens" bigint DEFAULT 0 NOT NULL,
	"cache_read_tokens" bigint DEFAULT 0 NOT NULL,
	"cache_write_tokens" bigint DEFAULT 0 NOT NULL,
	"reasoning_tokens" bigint DEFAULT 0 NOT NULL,
	"cost_usd" numeric(20, 10),
	"cost_source" text NOT NULL,
	"latency_ms" integer,
	"environment" text,
	"feature" text,
	"end_user_id" text,
	"trace_id" text,
	"session_id" text,
	CONSTRAINT "usage_events_nonnegative_tokens" CHECK ("usage_events"."input_tokens" >= 0 and "usage_events"."output_tokens" >= 0 and "usage_events"."cache_read_tokens" >= 0 and "usage_events"."cache_write_tokens" >= 0 and "usage_events"."reasoning_tokens" >= 0)
);
--> statement-breakpoint
ALTER TABLE "usage_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_inviter_id_user_id_fk" FOREIGN KEY ("inviter_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member" ADD CONSTRAINT "member_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member" ADD CONSTRAINT "member_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_user_idx" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "alert_delivery_notification_recipient_unique" ON "alert_deliveries" USING btree ("notification_id","recipient");--> statement-breakpoint
CREATE INDEX "alert_delivery_pending_idx" ON "alert_deliveries" USING btree ("organization_id","status");--> statement-breakpoint
CREATE INDEX "budgets_org_idx" ON "budgets" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "hourly_usage_org_hour_idx" ON "hourly_usage" USING btree ("organization_id","hour");--> statement-breakpoint
CREATE INDEX "invitation_org_email_idx" ON "invitation" USING btree ("organization_id","email");--> statement-breakpoint
CREATE UNIQUE INDEX "member_org_user_unique" ON "member" USING btree ("organization_id","user_id");--> statement-breakpoint
CREATE INDEX "member_user_idx" ON "member" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "model_prices_effective_unique" ON "model_prices" USING btree ("provider","model","effective_from");--> statement-breakpoint
CREATE INDEX "model_prices_lookup_idx" ON "model_prices" USING btree ("provider","model","effective_from");--> statement-breakpoint
CREATE UNIQUE INDEX "notifications_budget_period_threshold_unique" ON "notifications" USING btree ("budget_id","period_start","threshold");--> statement-breakpoint
CREATE INDEX "notifications_org_created_idx" ON "notifications" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE INDEX "project_api_keys_project_idx" ON "project_api_keys" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "project_api_keys_org_idx" ON "project_api_keys" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "projects_org_slug_unique" ON "projects" USING btree ("organization_id","slug");--> statement-breakpoint
CREATE INDEX "projects_org_idx" ON "projects" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "session_user_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "usage_events_project_event_unique" ON "usage_events" USING btree ("project_id","event_id");--> statement-breakpoint
CREATE INDEX "usage_events_org_occurred_idx" ON "usage_events" USING btree ("organization_id","occurred_at");--> statement-breakpoint
CREATE INDEX "usage_events_project_occurred_idx" ON "usage_events" USING btree ("project_id","occurred_at");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" USING btree ("identifier");--> statement-breakpoint
CREATE POLICY "alert_deliveries_tenant_isolation" ON "alert_deliveries" AS PERMISSIVE FOR ALL TO public USING ("alert_deliveries"."organization_id" = nullif(current_setting('app.current_organization_id', true), '')::uuid) WITH CHECK ("alert_deliveries"."organization_id" = nullif(current_setting('app.current_organization_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "budgets_tenant_isolation" ON "budgets" AS PERMISSIVE FOR ALL TO public USING ("budgets"."organization_id" = nullif(current_setting('app.current_organization_id', true), '')::uuid) WITH CHECK ("budgets"."organization_id" = nullif(current_setting('app.current_organization_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "hourly_usage_tenant_isolation" ON "hourly_usage" AS PERMISSIVE FOR ALL TO public USING ("hourly_usage"."organization_id" = nullif(current_setting('app.current_organization_id', true), '')::uuid) WITH CHECK ("hourly_usage"."organization_id" = nullif(current_setting('app.current_organization_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "notifications_tenant_isolation" ON "notifications" AS PERMISSIVE FOR ALL TO public USING ("notifications"."organization_id" = nullif(current_setting('app.current_organization_id', true), '')::uuid) WITH CHECK ("notifications"."organization_id" = nullif(current_setting('app.current_organization_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "projects_tenant_isolation" ON "projects" AS PERMISSIVE FOR ALL TO public USING ("projects"."organization_id" = nullif(current_setting('app.current_organization_id', true), '')::uuid) WITH CHECK ("projects"."organization_id" = nullif(current_setting('app.current_organization_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "usage_events_tenant_isolation" ON "usage_events" AS PERMISSIVE FOR ALL TO public USING ("usage_events"."organization_id" = nullif(current_setting('app.current_organization_id', true), '')::uuid) WITH CHECK ("usage_events"."organization_id" = nullif(current_setting('app.current_organization_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "alert_deliveries" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "budgets" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "hourly_usage" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "notifications" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "projects" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "usage_events" FORCE ROW LEVEL SECURITY;
