ALTER TABLE "mailboxes" ADD COLUMN "active_sync_lease_owner" text;--> statement-breakpoint
ALTER TABLE "mailboxes" ADD COLUMN "active_sync_lease_acquired_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "mailboxes" ADD COLUMN "active_sync_lease_heartbeat_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "mailboxes" ADD COLUMN "active_sync_lease_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "mailboxes" ADD COLUMN "active_sync_run_id" text;--> statement-breakpoint
ALTER TABLE "sync_runs" ADD COLUMN "lease_owner_id" text;--> statement-breakpoint
ALTER TABLE "sync_runs" ADD COLUMN "events_emitted" text;--> statement-breakpoint
ALTER TABLE "sync_runs" ADD COLUMN "next_cursor" text;--> statement-breakpoint
ALTER TABLE "sync_runs" ADD COLUMN "detail" text;