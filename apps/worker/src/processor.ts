import {
  type ControlJobDispatchRequest,
  type ControlJobRunResult,
  type GmailPushNotification,
  type GmailPushNotificationResult,
  type MailboxSyncJobData,
  type MailboxSyncDispatchExhaustedResult,
  type ProblemDetails,
  type ProcessWebhookDeliveryResult,
  type RecoverStuckMailboxSyncExecutionsResult,
  type RecoverWebhookDeliverySchedulingResult,
  type SyncMailboxResult,
  type WebhookDeliveryScheduleRequest,
  ingestGmailPushNotification,
  makeProblem,
  recordMailboxSyncDispatchExhausted,
  runControlJob,
  runWebhookDelivery,
  runMailboxSync,
} from "@mailmon/core";
import { Data, Effect } from "effect";

type EffectSuccess<T> = T extends Effect.Effect<infer A, any, any> ? A : never;

type WorkerProcessorRuntime<TEffect extends Effect.Effect<any, any, any>> = {
  readonly runPromise: (
    effect: TEffect,
    options?: {
      readonly signal?: AbortSignal;
    },
  ) => Promise<EffectSuccess<TEffect>>;
};

class WorkerProcessorUnknownError extends Data.TaggedError("WorkerProcessorUnknownError")<{
  readonly error: unknown;
}> {}

type WorkerTransportMode = "gcp" | "legacy_bullmq" | "local";

type MailboxSyncOperationalLogEvent =
  | {
      readonly event: "mailbox_sync_lease_contention";
      readonly mailboxId: string;
      readonly syncRunId: string;
      readonly leaseOwnerId: string | null;
      readonly transportMode: WorkerTransportMode;
      readonly occurredAt: string;
    }
  | {
      readonly event: "mailbox_sync_lease_lost";
      readonly mailboxId: string;
      readonly syncRunId: string;
      readonly leaseOwnerId: string | null;
      readonly transportMode: WorkerTransportMode;
      readonly occurredAt: string;
    }
  | {
      readonly event: "mailbox_sync_stuck_recovery";
      readonly mailboxId: string;
      readonly syncRunId: string | null;
      readonly leaseOwnerId: string | null;
      readonly transportMode: WorkerTransportMode;
      readonly occurredAt: string;
    }
  | {
      readonly event: "mailbox_sync_staging_pubsub_retry_smoke_forced_retry";
      readonly mailboxId: string;
      readonly transportMode: WorkerTransportMode;
      readonly occurredAt: string;
    }
  | {
      readonly event: "mailbox_sync_dispatch_retry_exhausted";
      readonly mailboxId: string;
      readonly syncRunId: string | null;
      readonly transportMode: WorkerTransportMode;
      readonly occurredAt: string;
      readonly detail: "mailbox_not_found" | "mailbox_sync_dispatch_retry_exhausted";
    }
  | {
      readonly event: "webhook_delivery_retry_exhausted";
      readonly deliveryId: string;
      readonly attemptCount: number | null;
      readonly transportMode: WorkerTransportMode;
      readonly occurredAt: string;
    }
  | {
      readonly event: "webhook_delivery_scheduling_recovery";
      readonly recovered: number;
      readonly transportMode: WorkerTransportMode;
      readonly occurredAt: string;
    };

type OperationalLogEmitter = (event: MailboxSyncOperationalLogEvent) => void;

interface OperationalLogOptions {
  readonly log?: OperationalLogEmitter;
  readonly transportMode?: WorkerTransportMode;
}

const defaultOperationalLog: OperationalLogEmitter = (event) => {
  console.log(JSON.stringify(event));
};

const getOperationalLogOptions = (options: OperationalLogOptions = {}) => {
  return {
    log: options.log ?? defaultOperationalLog,
    transportMode: options.transportMode ?? "local",
  } as const;
};

const isProblemDetails = (error: unknown): error is ProblemDetails => {
  return (
    typeof error === "object" && error !== null && "code" in error && typeof error.code === "string"
  );
};

const wrapProcessorError = (error: unknown) =>
  isProblemDetails(error) ? error : new WorkerProcessorUnknownError({ error });

const unwrapProcessorError = (error: ProblemDetails | WorkerProcessorUnknownError) =>
  isProblemDetails(error) ? error : error.error;

const emitOperationalLog = (
  options: ReturnType<typeof getOperationalLogOptions>,
  event: MailboxSyncOperationalLogEvent,
) => Effect.sync(() => options.log(event));

const logSyncResult = Effect.fn("worker.logSyncResult")(function* (
  result: SyncMailboxResult,
  options: ReturnType<typeof getOperationalLogOptions>,
) {
  if (result.status !== "skipped_due_to_active_lease") {
    return;
  }

  yield* emitOperationalLog(options, {
    event: "mailbox_sync_lease_contention",
    mailboxId: result.mailboxId,
    syncRunId: result.syncRunId,
    leaseOwnerId: result.leaseOwnerId,
    transportMode: options.transportMode,
    occurredAt: result.completedAt,
  });
});

const logMailboxSyncLeaseLost = Effect.fn("worker.logMailboxSyncLeaseLost")(function* (
  error: ProblemDetails,
  options: ReturnType<typeof getOperationalLogOptions>,
) {
  if (error.code !== "mailbox_sync_lease_lost") {
    return;
  }

  yield* emitOperationalLog(options, {
    event: "mailbox_sync_lease_lost",
    mailboxId: error.resource?.mailbox_id ?? "unknown",
    syncRunId: error.resource?.sync_run_id ?? "unknown",
    leaseOwnerId: error.resource?.lease_owner_id ?? null,
    transportMode: options.transportMode,
    occurredAt: new Date().toISOString(),
  });
});

const logRecoveredStuckSyncExecutions = Effect.fn("worker.logRecoveredStuckSyncExecutions")(
  function* (
    result: RecoverStuckMailboxSyncExecutionsResult,
    options: ReturnType<typeof getOperationalLogOptions>,
  ) {
    for (const recoveredExecution of result.recoveredExecutions) {
      yield* emitOperationalLog(options, {
        event: "mailbox_sync_stuck_recovery",
        mailboxId: recoveredExecution.mailboxId,
        syncRunId: recoveredExecution.syncRunId,
        leaseOwnerId: recoveredExecution.leaseOwnerId,
        transportMode: options.transportMode,
        occurredAt: result.completedAt,
      });
    }
  },
);

const logRecoveredWebhookDeliveryScheduling = Effect.fn(
  "worker.logRecoveredWebhookDeliveryScheduling",
)(function* (
  result: RecoverWebhookDeliverySchedulingResult,
  options: ReturnType<typeof getOperationalLogOptions>,
) {
  if (result.recovered === 0) {
    return;
  }

  yield* emitOperationalLog(options, {
    event: "webhook_delivery_scheduling_recovery",
    recovered: result.recovered,
    transportMode: options.transportMode,
    occurredAt: result.completedAt,
  });
});

const createStagingPubSubRetrySmokeProblem = (mailboxId: string): ProblemDetails =>
  makeProblem({
    type: "https://api.mailmon.dev/problems/staging-pubsub-retry-smoke-forced-retry",
    title: "Staging Pub/Sub retry smoke forced retry",
    status: 503,
    code: "staging_pubsub_retry_smoke_forced_retry",
    detail: `Synthetic mailbox ${mailboxId} is configured to force a retryable worker response for staging Pub/Sub validation.`,
    resource: {
      mailbox_id: mailboxId,
    },
    retryable: true,
  });

export const processSyncJobEffect = Effect.fn("worker.processSyncJob")(function* (
  job: MailboxSyncJobData,
  options?: OperationalLogOptions,
) {
  const operationalLogOptions = getOperationalLogOptions(options);
  const result = yield* runMailboxSync(job.mailboxId).pipe(
    Effect.tapError((error) =>
      isProblemDetails(error) ? logMailboxSyncLeaseLost(error, operationalLogOptions) : Effect.void,
    ),
  );

  yield* logSyncResult(result, operationalLogOptions);

  return result;
});

export const stagingPubSubRetrySmokeSyncFailureEffect = Effect.fn(
  "worker.stagingPubSubRetrySmokeSyncFailure",
)(function* (job: MailboxSyncJobData, options?: OperationalLogOptions) {
  const operationalLogOptions = getOperationalLogOptions(options);

  yield* emitOperationalLog(operationalLogOptions, {
    event: "mailbox_sync_staging_pubsub_retry_smoke_forced_retry",
    mailboxId: job.mailboxId,
    transportMode: operationalLogOptions.transportMode,
    occurredAt: new Date().toISOString(),
  });

  return yield* Effect.fail(createStagingPubSubRetrySmokeProblem(job.mailboxId));
});

export const processMailboxSyncDeadLetterEffect = Effect.fn("worker.processMailboxSyncDeadLetter")(
  function* (job: MailboxSyncJobData, options?: OperationalLogOptions) {
    const operationalLogOptions = getOperationalLogOptions(options);
    const result = yield* recordMailboxSyncDispatchExhausted(job.mailboxId);

    yield* emitOperationalLog(operationalLogOptions, {
      event: "mailbox_sync_dispatch_retry_exhausted",
      mailboxId: result.mailboxId,
      syncRunId: result.syncRunId,
      transportMode: operationalLogOptions.transportMode,
      occurredAt: result.recordedAt,
      detail: result.detail,
    });

    return result;
  },
);

export const processWebhookDeliveryEffect = Effect.fn("worker.processWebhookDelivery")(function* (
  request: WebhookDeliveryScheduleRequest,
  options?: OperationalLogOptions,
) {
  const operationalLogOptions = getOperationalLogOptions(options);
  const result = yield* runWebhookDelivery(request.deliveryId);

  if (result.status === "retry_exhausted") {
    yield* emitOperationalLog(operationalLogOptions, {
      event: "webhook_delivery_retry_exhausted",
      deliveryId: result.deliveryId,
      attemptCount: result.attemptCount,
      transportMode: operationalLogOptions.transportMode,
      occurredAt: new Date().toISOString(),
    });
  }

  return result;
});

export const processControlJobEffect = Effect.fn("worker.processControlJob")(function* (
  request: ControlJobDispatchRequest,
  options?: OperationalLogOptions,
) {
  const operationalLogOptions = getOperationalLogOptions(options);
  const result = yield* runControlJob(request);

  if (result.kind === "recover_stuck_syncs") {
    yield* logRecoveredStuckSyncExecutions(result, operationalLogOptions);
  }

  if (result.kind === "recover_webhook_deliveries") {
    yield* logRecoveredWebhookDeliveryScheduling(result, operationalLogOptions);
  }

  return result;
});

export const processGmailPushNotificationEffect = Effect.fn("worker.processGmailPushNotification")(
  function* (notification: GmailPushNotification) {
    return yield* ingestGmailPushNotification(notification);
  },
);

type SyncProcessorRuntime = WorkerProcessorRuntime<ReturnType<typeof runMailboxSync>>;

type WebhookDeliveryProcessorRuntime = WorkerProcessorRuntime<
  ReturnType<typeof runWebhookDelivery>
>;

type ControlJobProcessorRuntime = WorkerProcessorRuntime<ReturnType<typeof runControlJob>>;

type GmailPushProcessorRuntime = WorkerProcessorRuntime<
  ReturnType<typeof ingestGmailPushNotification>
>;

type SyncDeadLetterProcessorRuntime = WorkerProcessorRuntime<
  ReturnType<typeof recordMailboxSyncDispatchExhausted>
>;

export const createProcessSyncJob = (
  runtime: SyncProcessorRuntime,
  options?: OperationalLogOptions,
) => {
  const operationalLogOptions = getOperationalLogOptions(options);

  return (job: MailboxSyncJobData) =>
    Effect.runPromise(
      Effect.tryPromise({
        catch: wrapProcessorError,
        try: () => runtime.runPromise(runMailboxSync(job.mailboxId)),
      }).pipe(
        Effect.mapError(unwrapProcessorError),
        Effect.tapError((error) =>
          isProblemDetails(error)
            ? logMailboxSyncLeaseLost(error, operationalLogOptions)
            : Effect.void,
        ),
        Effect.tap((result) => logSyncResult(result, operationalLogOptions)),
      ),
    );
};

export const withStagingPubSubRetrySmokeSyncFailure = (
  processSyncJob: (job: MailboxSyncJobData) => Promise<SyncMailboxResult>,
  mailboxIds: ReadonlySet<string>,
  options?: OperationalLogOptions,
) => {
  return async (job: MailboxSyncJobData) => {
    if (!mailboxIds.has(job.mailboxId)) {
      return processSyncJob(job);
    }

    return Effect.runPromise(stagingPubSubRetrySmokeSyncFailureEffect(job, options));
  };
};

export const createProcessMailboxSyncDeadLetter = (
  runtime: SyncDeadLetterProcessorRuntime,
  options?: OperationalLogOptions,
) => {
  const operationalLogOptions = getOperationalLogOptions(options);

  return (job: MailboxSyncJobData): Promise<MailboxSyncDispatchExhaustedResult> =>
    Effect.runPromise(
      Effect.tryPromise({
        catch: wrapProcessorError,
        try: () => runtime.runPromise(recordMailboxSyncDispatchExhausted(job.mailboxId)),
      }).pipe(
        Effect.mapError(unwrapProcessorError),
        Effect.tap((result) =>
          emitOperationalLog(operationalLogOptions, {
            event: "mailbox_sync_dispatch_retry_exhausted",
            mailboxId: result.mailboxId,
            syncRunId: result.syncRunId,
            transportMode: operationalLogOptions.transportMode,
            occurredAt: result.recordedAt,
            detail: result.detail,
          }),
        ),
      ),
    );
};

export const createProcessWebhookDelivery = (
  runtime: WebhookDeliveryProcessorRuntime,
  options?: OperationalLogOptions,
) => {
  const operationalLogOptions = getOperationalLogOptions(options);

  return (request: WebhookDeliveryScheduleRequest): Promise<ProcessWebhookDeliveryResult> =>
    Effect.runPromise(
      Effect.tryPromise({
        catch: wrapProcessorError,
        try: () => runtime.runPromise(runWebhookDelivery(request.deliveryId)),
      }).pipe(
        Effect.mapError(unwrapProcessorError),
        Effect.tap((result) =>
          result.status === "retry_exhausted"
            ? emitOperationalLog(operationalLogOptions, {
                event: "webhook_delivery_retry_exhausted",
                deliveryId: result.deliveryId,
                attemptCount: result.attemptCount,
                transportMode: operationalLogOptions.transportMode,
                occurredAt: new Date().toISOString(),
              })
            : Effect.void,
        ),
      ),
    );
};

export const createProcessControlJob = (
  runtime: ControlJobProcessorRuntime,
  options?: OperationalLogOptions,
) => {
  const operationalLogOptions = getOperationalLogOptions(options);

  return (request: ControlJobDispatchRequest): Promise<ControlJobRunResult> =>
    Effect.runPromise(
      Effect.tryPromise({
        catch: wrapProcessorError,
        try: () => runtime.runPromise(runControlJob(request)),
      }).pipe(
        Effect.mapError(unwrapProcessorError),
        Effect.tap((result) =>
          Effect.gen(function* () {
            if (result.kind === "recover_stuck_syncs") {
              yield* logRecoveredStuckSyncExecutions(result, operationalLogOptions);
            }

            if (result.kind === "recover_webhook_deliveries") {
              yield* logRecoveredWebhookDeliveryScheduling(result, operationalLogOptions);
            }
          }),
        ),
      ),
    );
};

export const createProcessGmailPushNotification = (runtime: GmailPushProcessorRuntime) => {
  return (notification: GmailPushNotification): Promise<GmailPushNotificationResult> =>
    runtime.runPromise(ingestGmailPushNotification(notification));
};
