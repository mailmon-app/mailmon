ALTER TABLE "sync_runs" ADD COLUMN "previous_cursor" text;--> statement-breakpoint
CREATE INDEX "mailbox_events_mailbox_occurred_at_idx" ON "mailbox_events" USING btree ("mailbox_id","occurred_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "sync_runs_mailbox_started_at_idx" ON "sync_runs" USING btree ("mailbox_id","started_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "sync_runs_mailbox_status_started_at_idx" ON "sync_runs" USING btree ("mailbox_id","status","started_at" DESC NULLS LAST,"id" DESC NULLS LAST);