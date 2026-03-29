import { boolean, jsonb, pgTable, text, timestamp, unique } from "drizzle-orm/pg-core";

export const bootstrapState = pgTable("bootstrap_state", {
  name: text("name").primaryKey(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const mailboxes = pgTable("mailboxes", {
  id: text("id").primaryKey(),
  provider: text("provider").notNull(),
  emailAddress: text("email_address").notNull(),
  status: text("status").notNull(),
  syncState: text("sync_state").notNull(),
  watchState: text("watch_state").notNull(),
  activeSyncLeaseOwner: text("active_sync_lease_owner"),
  activeSyncLeaseAcquiredAt: timestamp("active_sync_lease_acquired_at", { withTimezone: true }),
  activeSyncLeaseHeartbeatAt: timestamp("active_sync_lease_heartbeat_at", { withTimezone: true }),
  activeSyncLeaseExpiresAt: timestamp("active_sync_lease_expires_at", { withTimezone: true }),
  activeSyncRunId: text("active_sync_run_id"),
  initializedAt: timestamp("initialized_at", { withTimezone: true }),
  lastSuccessfulSyncAt: timestamp("last_successful_sync_at", { withTimezone: true }),
  lastErrorCode: text("last_error_code"),
  lastErrorMessage: text("last_error_message"),
  lastErrorOccurredAt: timestamp("last_error_occurred_at", { withTimezone: true }),
  lastErrorRetryable: boolean("last_error_retryable"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const threads = pgTable(
  "threads",
  {
    id: text("id").primaryKey(),
    mailboxId: text("mailbox_id")
      .notNull()
      .references(() => mailboxes.id),
    providerThreadId: text("provider_thread_id").notNull(),
    subject: text("subject").notNull(),
    lastMessageAt: timestamp("last_message_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    mailboxProviderThreadIdUnique: unique("threads_mailbox_provider_thread_id_unique").on(
      table.mailboxId,
      table.providerThreadId,
    ),
  }),
);

export const messages = pgTable(
  "messages",
  {
    id: text("id").primaryKey(),
    mailboxId: text("mailbox_id")
      .notNull()
      .references(() => mailboxes.id),
    threadId: text("thread_id")
      .notNull()
      .references(() => threads.id),
    providerMessageId: text("provider_message_id").notNull(),
    providerThreadId: text("provider_thread_id").notNull(),
    subject: text("subject").notNull(),
    fromName: text("from_name"),
    fromEmail: text("from_email").notNull(),
    snippet: text("snippet").notNull(),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull(),
    labelIds: jsonb("label_ids").$type<string[]>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    mailboxProviderMessageIdUnique: unique("messages_mailbox_provider_message_id_unique").on(
      table.mailboxId,
      table.providerMessageId,
    ),
  }),
);

export const syncRuns = pgTable("sync_runs", {
  id: text("id").primaryKey(),
  mailboxId: text("mailbox_id")
    .notNull()
    .references(() => mailboxes.id),
  status: text("status").notNull(),
  leaseOwnerId: text("lease_owner_id"),
  startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  eventsEmitted: text("events_emitted"),
  nextCursor: text("next_cursor"),
  detail: text("detail"),
});

export const mailboxEvents = pgTable("mailbox_events", {
  id: text("id").primaryKey(),
  mailboxId: text("mailbox_id")
    .notNull()
    .references(() => mailboxes.id),
  eventType: text("event_type").notNull(),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).defaultNow().notNull(),
  payload: jsonb("payload").notNull(),
});
