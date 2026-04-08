import { boolean, index, jsonb, pgTable, text, timestamp, unique } from "drizzle-orm/pg-core";

export const bootstrapState = pgTable("bootstrap_state", {
  name: text("name").primaryKey(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const workspaces = pgTable("workspaces", {
  id: text("id").primaryKey(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const workspaceApiKeys = pgTable(
  "workspace_api_keys",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id),
    apiKeyHash: text("api_key_hash").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    apiKeyHashUnique: unique("workspace_api_keys_api_key_hash_unique").on(table.apiKeyHash),
  }),
);

export const mailboxes = pgTable(
  "mailboxes",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id").references(() => workspaces.id),
    provider: text("provider").notNull(),
    tenantExternalId: text("tenant_external_id"),
    mailboxExternalId: text("mailbox_external_id"),
    emailAddress: text("email_address").notNull(),
    status: text("status").notNull(),
    syncState: text("sync_state").notNull(),
    watchState: text("watch_state").notNull(),
    cursor: text("cursor"),
    activeSyncLeaseOwner: text("active_sync_lease_owner"),
    activeSyncLeaseAcquiredAt: timestamp("active_sync_lease_acquired_at", { withTimezone: true }),
    activeSyncLeaseHeartbeatAt: timestamp("active_sync_lease_heartbeat_at", {
      withTimezone: true,
    }),
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
  },
  (table) => ({
    workspaceProviderEmailUnique: unique("mailboxes_workspace_provider_email_unique").on(
      table.workspaceId,
      table.provider,
      table.emailAddress,
    ),
    workspaceProviderExternalIdentityUnique: unique(
      "mailboxes_workspace_provider_external_identity_unique",
    ).on(table.workspaceId, table.provider, table.tenantExternalId, table.mailboxExternalId),
  }),
);

export const mailboxConnectSessions = pgTable("mailbox_connect_sessions", {
  id: text("id").primaryKey(),
  provider: text("provider").notNull(),
  workspaceId: text("workspace_id")
    .notNull()
    .references(() => workspaces.id),
  tenantExternalId: text("tenant_external_id").notNull(),
  mailboxExternalId: text("mailbox_external_id").notNull(),
  redirectUrl: text("redirect_url").notNull(),
  codeVerifier: text("code_verifier").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  mailboxId: text("mailbox_id").references(() => mailboxes.id),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const gmailMailboxCredentials = pgTable("gmail_mailbox_credentials", {
  mailboxId: text("mailbox_id")
    .primaryKey()
    .references(() => mailboxes.id),
  refreshToken: text("refresh_token").notNull(),
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
    mailboxNewestFirstIndex: index("threads_mailbox_last_message_at_id_idx").on(
      table.mailboxId,
      table.lastMessageAt.desc(),
      table.id.desc(),
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
    mailboxNewestFirstIndex: index("messages_mailbox_received_at_id_idx").on(
      table.mailboxId,
      table.receivedAt.desc(),
      table.id.desc(),
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
