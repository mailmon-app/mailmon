ALTER TABLE "workspace_api_keys" ADD COLUMN "key_prefix" text;--> statement-breakpoint
ALTER TABLE "workspace_api_keys" ADD COLUMN "revoked_at" timestamp with time zone;