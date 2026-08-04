CREATE TYPE "public"."machine_tool" AS ENUM('cursor', 'codex', 'claude_code', 'gemini_cli', 'ollama');--> statement-breakpoint
CREATE TABLE "agent_activity_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"connection_id" uuid NOT NULL,
	"event_id" text NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"tool" "machine_tool" NOT NULL,
	"event_type" text NOT NULL,
	"model" text,
	"status" text,
	"duration_ms" integer,
	"session_id" text
);
--> statement-breakpoint
ALTER TABLE "agent_activity_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "machine_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"name" text NOT NULL,
	"platform" text NOT NULL,
	"credential_prefix" text NOT NULL,
	"credential_hash" text NOT NULL,
	"selected_tools" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"client_version" text NOT NULL,
	"last_seen_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "machine_connections_credential_hash_unique" UNIQUE("credential_hash")
);
--> statement-breakpoint
CREATE TABLE "machine_pairing_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"code_hash" text NOT NULL,
	"created_by" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "machine_pairing_codes_code_hash_unique" UNIQUE("code_hash")
);
--> statement-breakpoint
CREATE UNIQUE INDEX "agent_activity_project_event_unique" ON "agent_activity_events" USING btree ("project_id","event_id");--> statement-breakpoint
CREATE INDEX "agent_activity_org_occurred_idx" ON "agent_activity_events" USING btree ("organization_id","occurred_at");--> statement-breakpoint
CREATE INDEX "machine_connections_project_idx" ON "machine_connections" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "machine_connections_org_idx" ON "machine_connections" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "machine_pairing_codes_project_idx" ON "machine_pairing_codes" USING btree ("project_id");--> statement-breakpoint
CREATE POLICY "agent_activity_tenant_isolation" ON "agent_activity_events" AS PERMISSIVE FOR ALL TO public USING ("agent_activity_events"."organization_id" = nullif(current_setting('app.current_organization_id', true), '')::uuid) WITH CHECK ("agent_activity_events"."organization_id" = nullif(current_setting('app.current_organization_id', true), '')::uuid);