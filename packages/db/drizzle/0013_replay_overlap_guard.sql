CREATE EXTENSION IF NOT EXISTS "btree_gist";--> statement-breakpoint
ALTER TABLE "replays" ADD CONSTRAINT "replays_active_overlap_excl" EXCLUDE USING gist (
	"workspace_id" WITH =,
	"mailbox_id" WITH =,
	"webhook_endpoint_id" WITH =,
	tstzrange("start_time", "end_time", '[]') WITH &&
) WHERE ("status" IN ('queued', 'running'));
