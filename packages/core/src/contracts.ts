import { Schema } from "effect";

export const MailboxStatusSchema = Schema.Literal("active", "reconnect_required", "disabled");
export const MailboxSyncStateSchema = Schema.Literal(
  "initializing",
  "healthy",
  "lagging",
  "failed",
);
export const MailboxWatchStateSchema = Schema.Literal("active", "expiring", "expired", "unhealthy");
export const ReplayStatusSchema = Schema.Literal(
  "queued",
  "running",
  "completed",
  "failed",
  "cancelled",
);
export const MailboxSyncJobDataSchema = Schema.Struct({
  mailboxId: Schema.NonEmptyString,
});

export type MailboxStatus = Schema.Schema.Type<typeof MailboxStatusSchema>;
export type MailboxSyncState = Schema.Schema.Type<typeof MailboxSyncStateSchema>;
export type MailboxWatchState = Schema.Schema.Type<typeof MailboxWatchStateSchema>;
export type ReplayStatus = Schema.Schema.Type<typeof ReplayStatusSchema>;
export type MailboxSyncJobData = Schema.Schema.Type<typeof MailboxSyncJobDataSchema>;

export interface MailboxOperationalError {
  readonly code: string;
  readonly message: string;
  readonly occurredAt: string;
  readonly retryable: boolean;
}

export interface MailboxResource {
  readonly id: string;
  readonly object: "mailbox";
  readonly provider: "gmail";
  readonly emailAddress: string;
  readonly status: MailboxStatus;
  readonly syncState: MailboxSyncState;
  readonly watchState: MailboxWatchState;
  readonly initializedAt: string | null;
  readonly lastSuccessfulSyncAt: string | null;
  readonly lastError: MailboxOperationalError | null;
}

export interface ProblemDetails {
  readonly type: string;
  readonly title: string;
  readonly status: number;
  readonly code: string;
  readonly detail: string;
  readonly resource?: Readonly<Record<string, string>>;
  readonly retryable: boolean;
}

export interface ReplayResource {
  readonly id: string;
  readonly object: "replay";
  readonly status: ReplayStatus;
  readonly mailboxId: string;
  readonly startTime: string;
  readonly endTime: string;
  readonly eventsReplayed?: number;
}

export interface WebhookEventEnvelope {
  readonly id: string;
  readonly type: "message.created" | "message.updated" | "thread.updated";
  readonly schemaVersion: 1;
  readonly occurredAt: string;
  readonly workspaceId: string;
  readonly tenantExternalId: string;
  readonly mailboxId: string;
  readonly data: Readonly<Record<string, string>>;
}

export interface StartedSyncRun {
  readonly syncRunId: string;
  readonly mailboxId: string;
  readonly startedAt: string;
}

export interface MailboxProviderSyncResult {
  readonly eventsEmitted: number;
  readonly nextCursor: string | null;
}

export interface SyncMailboxResult extends StartedSyncRun {
  readonly completedAt: string;
  readonly eventsEmitted: number;
  readonly nextCursor: string | null;
}
