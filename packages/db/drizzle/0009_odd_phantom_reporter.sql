ALTER TABLE "webhook_endpoints"
ADD COLUMN "consecutive_delivery_failures" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
CREATE TABLE "webhook_deliveries" (
	"id" text PRIMARY KEY NOT NULL,
	"mailbox_event_id" text NOT NULL,
	"webhook_endpoint_id" text NOT NULL,
	"state" text NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"processing_started_at" timestamp with time zone,
	"last_attempted_at" timestamp with time zone,
	"next_attempt_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"last_response_status" integer,
	"last_error_code" text,
	"last_error_message" text,
	"last_error_occurred_at" timestamp with time zone,
	"last_error_retryable" boolean,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "webhook_deliveries_mailbox_event_endpoint_unique" UNIQUE("mailbox_event_id","webhook_endpoint_id")
);
--> statement-breakpoint
ALTER TABLE "webhook_deliveries"
ADD CONSTRAINT "webhook_deliveries_mailbox_event_id_mailbox_events_id_fk" FOREIGN KEY ("mailbox_event_id") REFERENCES "public"."mailbox_events"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "webhook_deliveries"
ADD CONSTRAINT "webhook_deliveries_webhook_endpoint_id_webhook_endpoints_id_fk" FOREIGN KEY ("webhook_endpoint_id") REFERENCES "public"."webhook_endpoints"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "webhook_deliveries_state_next_attempt_at_idx" ON "webhook_deliveries" USING btree ("state","next_attempt_at");
--> statement-breakpoint
CREATE INDEX "webhook_deliveries_endpoint_id_idx" ON "webhook_deliveries" USING btree ("webhook_endpoint_id");
