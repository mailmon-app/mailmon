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
export const SyncRunOutcomeSchema = Schema.Literal(
  "completed",
  "skipped_due_to_active_lease",
  "failed_after_lease_acquired",
  "lease_lost",
);
export const ControlJobKindSchema = Schema.Literal(
  "renew_watches",
  "dispatch_replays",
  "repair_mailboxes",
  "cleanup",
);
export const MailboxSyncJobDataSchema = Schema.Struct({
  mailboxId: Schema.NonEmptyString,
});
export const WebhookDeliveryScheduleRequestSchema = Schema.Struct({
  deliveryId: Schema.NonEmptyString,
});
export const ControlJobDispatchRequestSchema = Schema.Struct({
  kind: ControlJobKindSchema,
});

export type MailboxStatus = Schema.Schema.Type<typeof MailboxStatusSchema>;
export type MailboxSyncState = Schema.Schema.Type<typeof MailboxSyncStateSchema>;
export type MailboxWatchState = Schema.Schema.Type<typeof MailboxWatchStateSchema>;
export type ReplayStatus = Schema.Schema.Type<typeof ReplayStatusSchema>;
export type SyncRunOutcome = Schema.Schema.Type<typeof SyncRunOutcomeSchema>;
export type ControlJobKind = Schema.Schema.Type<typeof ControlJobKindSchema>;
export type MailboxSyncJobData = Schema.Schema.Type<typeof MailboxSyncJobDataSchema>;
export type WebhookDeliveryScheduleRequest = Schema.Schema.Type<
  typeof WebhookDeliveryScheduleRequestSchema
>;
export type ControlJobDispatchRequest = Schema.Schema.Type<typeof ControlJobDispatchRequestSchema>;

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

export interface CompletedSyncRun {
  readonly syncRunId: string;
  readonly mailboxId: string;
  readonly completedAt: string;
  readonly status: SyncRunOutcome;
  readonly eventsEmitted: number;
  readonly nextCursor: string | null;
  readonly detail: string | null;
}

export interface CanonicalThreadRecord {
  readonly id: string;
  readonly providerThreadId: string;
  readonly subject: string;
  readonly lastMessageAt: string;
}

export interface CanonicalMessageRecord {
  readonly id: string;
  readonly threadId: string;
  readonly providerMessageId: string;
  readonly providerThreadId: string;
  readonly subject: string;
  readonly from: Readonly<{
    readonly name: string | null;
    readonly email: string;
  }>;
  readonly snippet: string;
  readonly receivedAt: string;
  readonly labelIds: ReadonlyArray<string>;
}

export interface MailboxSyncSnapshot {
  readonly threads: ReadonlyArray<CanonicalThreadRecord>;
  readonly messages: ReadonlyArray<CanonicalMessageRecord>;
}

export interface MailboxProviderSyncResult {
  readonly snapshot: MailboxSyncSnapshot;
  readonly eventsEmitted: number;
  readonly nextCursor: string | null;
}

export interface MailboxSyncLeaseAcquisition {
  readonly acquired: boolean;
  readonly expiresAt: string | null;
}

export interface MailboxSyncLeaseRenewal {
  readonly renewed: boolean;
  readonly expiresAt: string | null;
}

export interface CompletedSyncMailboxResult extends StartedSyncRun {
  readonly status: "completed";
  readonly completedAt: string;
  readonly eventsEmitted: number;
  readonly nextCursor: string | null;
}

export interface SkippedSyncMailboxResult extends StartedSyncRun {
  readonly status: "skipped_due_to_active_lease";
  readonly completedAt: string;
  readonly eventsEmitted: 0;
  readonly nextCursor: null;
}

export type SyncMailboxResult = CompletedSyncMailboxResult | SkippedSyncMailboxResult;
