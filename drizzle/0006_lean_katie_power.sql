CREATE TABLE "machine_device_authorizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"device_code_hash" text NOT NULL,
	"user_code_hash" text NOT NULL,
	"device_name" text NOT NULL,
	"platform" text NOT NULL,
	"client_version" text NOT NULL,
	"selected_tools" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"interval_seconds" integer DEFAULT 2 NOT NULL,
	"organization_id" uuid,
	"project_id" uuid,
	"approved_by" text,
	"approved_at" timestamp with time zone,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "machine_device_authorizations_device_code_hash_unique" UNIQUE("device_code_hash"),
	CONSTRAINT "machine_device_authorizations_user_code_hash_unique" UNIQUE("user_code_hash")
);
--> statement-breakpoint
CREATE INDEX "machine_device_authorizations_expires_idx" ON "machine_device_authorizations" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "machine_device_authorizations_project_idx" ON "machine_device_authorizations" USING btree ("project_id");