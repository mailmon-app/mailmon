import type { MailboxEventEnvelope, MailboxEventType } from "@mailmon/core";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";

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
    keyPrefix: text("key_prefix"),
    apiKeyHash: text("api_key_hash").notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
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
    watchExpirationAt: timestamp("watch_expiration_at", { withTimezone: true }),
    watchLastRenewedAt: timestamp("watch_last_renewed_at", { withTimezone: true }),
    watchLastHistoryId: text("watch_last_history_id"),
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
    providerStatusWatchExpirationIndex: index("mailboxes_provider_status_watch_expiration_idx").on(
      table.provider,
      table.status,
      table.watchExpirationAt,
    ),
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
  refreshTokenCiphertext: text("refresh_token").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const webhookEndpoints = pgTable(
  "webhook_endpoints",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id),
    url: text("url").notNull(),
    description: text("description"),
    signingSecret: text("signing_secret").notNull(),
    deliveryState: text("delivery_state").notNull(),
    lastDeliveryAt: timestamp("last_delivery_at", { withTimezone: true }),
    lastErrorCode: text("last_error_code"),
    lastErrorMessage: text("last_error_message"),
    lastErrorOccurredAt: timestamp("last_error_occurred_at", { withTimezone: true }),
    lastErrorRetryable: boolean("last_error_retryable"),
    consecutiveDeliveryFailures: integer("consecutive_delivery_failures").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    workspaceUrlUnique: unique("webhook_endpoints_workspace_url_unique").on(
      table.workspaceId,
      table.url,
    ),
  }),
);

export const webhookEndpointSubscriptions = pgTable(
  "webhook_endpoint_subscriptions",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id),
    webhookEndpointId: text("webhook_endpoint_id")
      .notNull()
      .references(() => webhookEndpoints.id),
    mailboxId: text("mailbox_id")
      .notNull()
      .references(() => mailboxes.id),
    eventTypes: jsonb("event_types").$type<string[]>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    endpointMailboxUnique: unique("webhook_endpoint_subscriptions_endpoint_mailbox_unique").on(
      table.webhookEndpointId,
      table.mailboxId,
    ),
    mailboxIndex: index("webhook_endpoint_subscriptions_mailbox_id_idx").on(table.mailboxId),
    webhookEndpointIndex: index("webhook_endpoint_subscriptions_endpoint_id_idx").on(
      table.webhookEndpointId,
    ),
  }),
);

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

export const syncRuns = pgTable(
  "sync_runs",
  {
    id: text("id").primaryKey(),
    mailboxId: text("mailbox_id")
      .notNull()
      .references(() => mailboxes.id),
    status: text("status").notNull(),
    leaseOwnerId: text("lease_owner_id"),
    startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    eventsEmitted: text("events_emitted"),
    previousCursor: text("previous_cursor"),
    nextCursor: text("next_cursor"),
    detail: text("detail"),
  },
  (table) => ({
    mailboxStartedAtIndex: index("sync_runs_mailbox_started_at_idx").on(
      table.mailboxId,
      table.startedAt.desc(),
      table.id.desc(),
    ),
    mailboxStatusStartedAtIndex: index("sync_runs_mailbox_status_started_at_idx").on(
      table.mailboxId,
      table.status,
      table.startedAt.desc(),
      table.id.desc(),
    ),
  }),
);

export const mailboxEvents = pgTable(
  "mailbox_events",
  {
    id: text("id").primaryKey(),
    mailboxId: text("mailbox_id")
      .notNull()
      .references(() => mailboxes.id),
    eventType: text("event_type").$type<MailboxEventType>().notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).defaultNow().notNull(),
    payload: jsonb("payload").$type<MailboxEventEnvelope>().notNull(),
  },
  (table) => ({
    mailboxOccurredAtIndex: index("mailbox_events_mailbox_occurred_at_idx").on(
      table.mailboxId,
      table.occurredAt.desc(),
      table.id.desc(),
    ),
  }),
);

export const webhookDeliveries = pgTable(
  "webhook_deliveries",
  {
    id: text("id").primaryKey(),
    mailboxEventId: text("mailbox_event_id")
      .notNull()
      .references(() => mailboxEvents.id),
    webhookEndpointId: text("webhook_endpoint_id")
      .notNull()
      .references(() => webhookEndpoints.id),
    state: text("state").notNull(),
    attemptCount: integer("attempt_count").notNull().default(0),
    processingStartedAt: timestamp("processing_started_at", { withTimezone: true }),
    lastAttemptedAt: timestamp("last_attempted_at", { withTimezone: true }),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    lastResponseStatus: integer("last_response_status"),
    lastErrorCode: text("last_error_code"),
    lastErrorMessage: text("last_error_message"),
    lastErrorOccurredAt: timestamp("last_error_occurred_at", { withTimezone: true }),
    lastErrorRetryable: boolean("last_error_retryable"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    mailboxEventEndpointUnique: unique("webhook_deliveries_mailbox_event_endpoint_unique").on(
      table.mailboxEventId,
      table.webhookEndpointId,
    ),
    nextAttemptIndex: index("webhook_deliveries_state_next_attempt_at_idx").on(
      table.state,
      table.nextAttemptAt,
    ),
    webhookEndpointIndex: index("webhook_deliveries_endpoint_id_idx").on(table.webhookEndpointId),
  }),
);
