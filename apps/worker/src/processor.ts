import {
  type MailboxSyncJobData,
  type ProcessWebhookDeliveryResult,
  type WebhookDeliveryScheduleRequest,
  runWebhookDelivery,
  runMailboxSync,
} from "@mailmon/core";

type WorkerProcessorRuntime<R> = {
  readonly runPromise: <A, E>(
    effect: import("effect").Effect.Effect<A, E, R>,
    options?: {
      readonly signal?: AbortSignal;
    },
  ) => Promise<A>;
};

type SyncProcessorRuntime = WorkerProcessorRuntime<
  import("effect").Effect.Effect.Context<ReturnType<typeof runMailboxSync>>
>;

type WebhookDeliveryProcessorRuntime = WorkerProcessorRuntime<
  import("effect").Effect.Effect.Context<ReturnType<typeof runWebhookDelivery>>
>;

export const createProcessSyncJob = (runtime: SyncProcessorRuntime) => {
  return (job: MailboxSyncJobData) => runtime.runPromise(runMailboxSync(job.mailboxId));
};

export const createProcessWebhookDelivery = (runtime: WebhookDeliveryProcessorRuntime) => {
  return (request: WebhookDeliveryScheduleRequest): Promise<ProcessWebhookDeliveryResult> =>
    runtime.runPromise(runWebhookDelivery(request.deliveryId));
};
