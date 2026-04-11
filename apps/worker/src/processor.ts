import {
  MailboxCatalog,
  MailboxSyncCoordinator,
  MailboxSyncProvider,
  MailboxStateStore,
  SyncRunStore,
  type MailboxSyncJobData,
  type ProcessWebhookDeliveryResult,
  type WebhookDeliveryScheduleRequest,
  runWebhookDelivery,
  runMailboxSync,
  WebhookDeliveryScheduler,
  WebhookDeliverySender,
  WebhookDeliveryStore,
} from "@mailmon/core";

export interface WorkerSyncProcessorRuntime {
  readonly runPromise: <A, E>(
    effect: import("effect").Effect.Effect<
      A,
      E,
      | MailboxCatalog
      | MailboxSyncCoordinator
      | MailboxSyncProvider
      | MailboxStateStore
      | SyncRunStore
      | WebhookDeliveryScheduler
      | WebhookDeliverySender
      | WebhookDeliveryStore
    >,
    options?: {
      readonly signal?: AbortSignal;
    },
  ) => Promise<A>;
}

export const createProcessSyncJob = (runtime: WorkerSyncProcessorRuntime) => {
  return (job: MailboxSyncJobData) => runtime.runPromise(runMailboxSync(job.mailboxId));
};

export const createProcessWebhookDelivery = (runtime: WorkerSyncProcessorRuntime) => {
  return (request: WebhookDeliveryScheduleRequest): Promise<ProcessWebhookDeliveryResult> =>
    runtime.runPromise(runWebhookDelivery(request.deliveryId));
};
