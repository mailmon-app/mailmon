ALTER TABLE "mailboxes"
ADD COLUMN "watch_expiration_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "mailboxes"
ADD COLUMN "watch_last_renewed_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "mailboxes"
ADD COLUMN "watch_last_history_id" text;
--> statement-breakpoint
CREATE INDEX "mailboxes_provider_status_watch_expiration_idx" ON "mailboxes" USING btree ("provider","status","watch_expiration_at");
