CREATE TABLE "bootstrap_state" (
	"name" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
