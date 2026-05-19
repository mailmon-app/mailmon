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

type WorkerProcessorRuntime = {
  readonly runPromise: (
    effect: Effect.Effect<any, any, any>,
    options?: {
      readonly signal?: AbortSignal;
    },
  ) => Promise<any>;
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

const observeSyncResult = <A extends SyncMailboxResult, R>(
  effect: Effect.Effect<A, unknown, R>,
  options: ReturnType<typeof getOperationalLogOptions>,
) =>
  effect.pipe(
    Effect.tapError((error) =>
      isProblemDetails(error) ? logMailboxSyncLeaseLost(error, options) : Effect.void,
    ),
    Effect.tap((result) => logSyncResult(result, options)),
  );

const observeMailboxSyncDeadLetterResult = <A extends MailboxSyncDispatchExhaustedResult, R>(
  effect: Effect.Effect<A, unknown, R>,
  options: ReturnType<typeof getOperationalLogOptions>,
) =>
  effect.pipe(
    Effect.tap((result) =>
      emitOperationalLog(options, {
        event: "mailbox_sync_dispatch_retry_exhausted",
        mailboxId: result.mailboxId,
        syncRunId: result.syncRunId,
        transportMode: options.transportMode,
        occurredAt: result.recordedAt,
        detail: result.detail,
      }),
    ),
  );

const observeWebhookDeliveryResult = <A extends ProcessWebhookDeliveryResult, R>(
  effect: Effect.Effect<A, unknown, R>,
  options: ReturnType<typeof getOperationalLogOptions>,
) =>
  effect.pipe(
    Effect.tap((result) =>
      result.status === "retry_exhausted"
        ? emitOperationalLog(options, {
            event: "webhook_delivery_retry_exhausted",
            deliveryId: result.deliveryId,
            attemptCount: result.attemptCount,
            transportMode: options.transportMode,
            occurredAt: new Date().toISOString(),
          })
        : Effect.void,
    ),
  );

const observeControlJobResult = <A extends ControlJobRunResult, R>(
  effect: Effect.Effect<A, unknown, R>,
  options: ReturnType<typeof getOperationalLogOptions>,
) =>
  effect.pipe(
    Effect.tap((result) =>
      Effect.gen(function* () {
        if (result.kind === "recover_stuck_syncs") {
          yield* logRecoveredStuckSyncExecutions(result, options);
        }

        if (result.kind === "recover_webhook_deliveries") {
          yield* logRecoveredWebhookDeliveryScheduling(result, options);
        }
      }),
    ),
  );

const stagingPubSubRetrySmokeSyncFailureEffect = Effect.fn(
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

const processGmailPushNotificationEffect = Effect.fn("worker.processGmailPushNotification")(
  function* (notification: GmailPushNotification) {
    return yield* ingestGmailPushNotification(notification);
  },
);

const runProcessorEffect = <A, E, R>(
  runtime: WorkerProcessorRuntime,
  effect: Effect.Effect<A, E, R>,
) =>
  Effect.tryPromise({
    catch: wrapProcessorError,
    try: async (): Promise<A> => runtime.runPromise(effect),
  }).pipe(Effect.mapError(unwrapProcessorError));

export const createProcessSyncJob = (
  runtime: WorkerProcessorRuntime,
  options?: OperationalLogOptions,
) => {
  const operationalLogOptions = getOperationalLogOptions(options);

  return (job: MailboxSyncJobData) =>
    Effect.runPromise(
      observeSyncResult(
        runProcessorEffect(runtime, runMailboxSync(job.mailboxId)),
        operationalLogOptions,
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
  runtime: WorkerProcessorRuntime,
  options?: OperationalLogOptions,
) => {
  const operationalLogOptions = getOperationalLogOptions(options);

  return (job: MailboxSyncJobData): Promise<MailboxSyncDispatchExhaustedResult> =>
    Effect.runPromise(
      observeMailboxSyncDeadLetterResult(
        runProcessorEffect(runtime, recordMailboxSyncDispatchExhausted(job.mailboxId)),
        operationalLogOptions,
      ),
    );
};

export const createProcessWebhookDelivery = (
  runtime: WorkerProcessorRuntime,
  options?: OperationalLogOptions,
) => {
  const operationalLogOptions = getOperationalLogOptions(options);

  return (request: WebhookDeliveryScheduleRequest): Promise<ProcessWebhookDeliveryResult> =>
    Effect.runPromise(
      observeWebhookDeliveryResult(
        runProcessorEffect(runtime, runWebhookDelivery(request.deliveryId)),
        operationalLogOptions,
      ),
    );
};

export const createProcessControlJob = (
  runtime: WorkerProcessorRuntime,
  options?: OperationalLogOptions,
) => {
  const operationalLogOptions = getOperationalLogOptions(options);

  return (request: ControlJobDispatchRequest): Promise<ControlJobRunResult> =>
    Effect.runPromise(
      observeControlJobResult(
        runProcessorEffect(runtime, runControlJob(request)),
        operationalLogOptions,
      ),
    );
};

export const createProcessGmailPushNotification = (runtime: WorkerProcessorRuntime) => {
  return (notification: GmailPushNotification): Promise<GmailPushNotificationResult> =>
    runtime.runPromise(processGmailPushNotificationEffect(notification));
};
