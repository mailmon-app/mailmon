CREATE TABLE "gmail_mailbox_credentials" (
	"mailbox_id" text PRIMARY KEY NOT NULL,
	"refresh_token" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "gmail_mailbox_credentials" ADD CONSTRAINT "gmail_mailbox_credentials_mailbox_id_mailboxes_id_fk" FOREIGN KEY ("mailbox_id") REFERENCES "public"."mailboxes"("id") ON DELETE no action ON UPDATE no action;