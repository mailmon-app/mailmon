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
  recordMailboxSyncDispatchExhausted,
  runControlJob,
  runWebhookDelivery,
  runMailboxSync,
} from "@mailmon/core";

type WorkerProcessorRuntime<R> = {
  readonly runPromise: <A, E, R2 extends R>(
    effect: import("effect").Effect.Effect<A, E, R2>,
    options?: {
      readonly signal?: AbortSignal;
    },
  ) => Promise<A>;
};

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

const logSyncResult = (
  result: SyncMailboxResult,
  options: ReturnType<typeof getOperationalLogOptions>,
) => {
  if (result.status !== "skipped_due_to_active_lease") {
    return;
  }

  options.log({
    event: "mailbox_sync_lease_contention",
    mailboxId: result.mailboxId,
    syncRunId: result.syncRunId,
    leaseOwnerId: result.leaseOwnerId,
    transportMode: options.transportMode,
    occurredAt: result.completedAt,
  });
};

const logMailboxSyncLeaseLost = (
  error: ProblemDetails,
  options: ReturnType<typeof getOperationalLogOptions>,
) => {
  if (error.code !== "mailbox_sync_lease_lost") {
    return;
  }

  options.log({
    event: "mailbox_sync_lease_lost",
    mailboxId: error.resource?.mailbox_id ?? "unknown",
    syncRunId: error.resource?.sync_run_id ?? "unknown",
    leaseOwnerId: error.resource?.lease_owner_id ?? null,
    transportMode: options.transportMode,
    occurredAt: new Date().toISOString(),
  });
};

const logRecoveredStuckSyncExecutions = (
  result: RecoverStuckMailboxSyncExecutionsResult,
  options: ReturnType<typeof getOperationalLogOptions>,
) => {
  for (const recoveredExecution of result.recoveredExecutions) {
    options.log({
      event: "mailbox_sync_stuck_recovery",
      mailboxId: recoveredExecution.mailboxId,
      syncRunId: recoveredExecution.syncRunId,
      leaseOwnerId: recoveredExecution.leaseOwnerId,
      transportMode: options.transportMode,
      occurredAt: result.completedAt,
    });
  }
};

const logRecoveredWebhookDeliveryScheduling = (
  result: RecoverWebhookDeliverySchedulingResult,
  options: ReturnType<typeof getOperationalLogOptions>,
) => {
  if (result.recovered === 0) {
    return;
  }

  options.log({
    event: "webhook_delivery_scheduling_recovery",
    recovered: result.recovered,
    transportMode: options.transportMode,
    occurredAt: result.completedAt,
  });
};

type SyncProcessorRuntime = WorkerProcessorRuntime<
  import("effect").Effect.Effect.Context<ReturnType<typeof runMailboxSync>>
>;

type WebhookDeliveryProcessorRuntime = WorkerProcessorRuntime<
  import("effect").Effect.Effect.Context<ReturnType<typeof runWebhookDelivery>>
>;

type ControlJobProcessorRuntime = WorkerProcessorRuntime<
  import("effect").Effect.Effect.Context<ReturnType<typeof runControlJob>>
>;

type GmailPushProcessorRuntime = WorkerProcessorRuntime<
  import("effect").Effect.Effect.Context<ReturnType<typeof ingestGmailPushNotification>>
>;

type SyncDeadLetterProcessorRuntime = WorkerProcessorRuntime<
  import("effect").Effect.Effect.Context<ReturnType<typeof recordMailboxSyncDispatchExhausted>>
>;

export const createProcessSyncJob = (
  runtime: SyncProcessorRuntime,
  options?: OperationalLogOptions,
) => {
  const operationalLogOptions = getOperationalLogOptions(options);

  return async (job: MailboxSyncJobData) => {
    try {
      const result = await runtime.runPromise(runMailboxSync(job.mailboxId));
      logSyncResult(result, operationalLogOptions);

      return result;
    } catch (error) {
      if (isProblemDetails(error)) {
        logMailboxSyncLeaseLost(error, operationalLogOptions);
      }

      throw error;
    }
  };
};

export const createProcessMailboxSyncDeadLetter = (
  runtime: SyncDeadLetterProcessorRuntime,
  options?: OperationalLogOptions,
) => {
  const operationalLogOptions = getOperationalLogOptions(options);

  return async (job: MailboxSyncJobData): Promise<MailboxSyncDispatchExhaustedResult> => {
    const result = await runtime.runPromise(recordMailboxSyncDispatchExhausted(job.mailboxId));

    operationalLogOptions.log({
      event: "mailbox_sync_dispatch_retry_exhausted",
      mailboxId: result.mailboxId,
      syncRunId: result.syncRunId,
      transportMode: operationalLogOptions.transportMode,
      occurredAt: result.recordedAt,
      detail: result.detail,
    });

    return result;
  };
};

export const createProcessWebhookDelivery = (
  runtime: WebhookDeliveryProcessorRuntime,
  options?: OperationalLogOptions,
) => {
  const operationalLogOptions = getOperationalLogOptions(options);

  return async (request: WebhookDeliveryScheduleRequest): Promise<ProcessWebhookDeliveryResult> => {
    const result = await runtime.runPromise(runWebhookDelivery(request.deliveryId));

    if (result.status === "retry_exhausted") {
      operationalLogOptions.log({
        event: "webhook_delivery_retry_exhausted",
        deliveryId: result.deliveryId,
        attemptCount: result.attemptCount,
        transportMode: operationalLogOptions.transportMode,
        occurredAt: new Date().toISOString(),
      });
    }

    return result;
  };
};

export const createProcessControlJob = (
  runtime: ControlJobProcessorRuntime,
  options?: OperationalLogOptions,
) => {
  const operationalLogOptions = getOperationalLogOptions(options);

  return async (request: ControlJobDispatchRequest): Promise<ControlJobRunResult> => {
    const result = await runtime.runPromise(runControlJob(request));

    if (result.kind === "recover_stuck_syncs") {
      logRecoveredStuckSyncExecutions(result, operationalLogOptions);
    }

    if (result.kind === "recover_webhook_deliveries") {
      logRecoveredWebhookDeliveryScheduling(result, operationalLogOptions);
    }

    return result;
  };
};

export const createProcessGmailPushNotification = (runtime: GmailPushProcessorRuntime) => {
  return (notification: GmailPushNotification): Promise<GmailPushNotificationResult> =>
    runtime.runPromise(ingestGmailPushNotification(notification));
};
