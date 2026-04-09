CREATE TABLE "webhook_endpoint_subscriptions" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"webhook_endpoint_id" text NOT NULL,
	"mailbox_id" text NOT NULL,
	"event_types" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "webhook_endpoint_subscriptions_endpoint_mailbox_unique" UNIQUE("webhook_endpoint_id","mailbox_id")
);
--> statement-breakpoint
CREATE TABLE "webhook_endpoints" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"url" text NOT NULL,
	"description" text,
	"signing_secret" text NOT NULL,
	"delivery_state" text NOT NULL,
	"last_delivery_at" timestamp with time zone,
	"last_error_code" text,
	"last_error_message" text,
	"last_error_occurred_at" timestamp with time zone,
	"last_error_retryable" boolean,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "webhook_endpoints_workspace_url_unique" UNIQUE("workspace_id","url")
);
--> statement-breakpoint
ALTER TABLE "webhook_endpoint_subscriptions" ADD CONSTRAINT "webhook_endpoint_subscriptions_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_endpoint_subscriptions" ADD CONSTRAINT "webhook_endpoint_subscriptions_webhook_endpoint_id_webhook_endpoints_id_fk" FOREIGN KEY ("webhook_endpoint_id") REFERENCES "public"."webhook_endpoints"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_endpoint_subscriptions" ADD CONSTRAINT "webhook_endpoint_subscriptions_mailbox_id_mailboxes_id_fk" FOREIGN KEY ("mailbox_id") REFERENCES "public"."mailboxes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_endpoints" ADD CONSTRAINT "webhook_endpoints_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "webhook_endpoint_subscriptions_mailbox_id_idx" ON "webhook_endpoint_subscriptions" USING btree ("mailbox_id");--> statement-breakpoint
CREATE INDEX "webhook_endpoint_subscriptions_endpoint_id_idx" ON "webhook_endpoint_subscriptions" USING btree ("webhook_endpoint_id");