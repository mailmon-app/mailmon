import {
  type ControlJobDispatchRequest,
  type ControlJobRunResult,
  type MailboxSyncJobData,
  type ProcessWebhookDeliveryResult,
  type WebhookDeliveryScheduleRequest,
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

type SyncProcessorRuntime = WorkerProcessorRuntime<
  import("effect").Effect.Effect.Context<ReturnType<typeof runMailboxSync>>
>;

type WebhookDeliveryProcessorRuntime = WorkerProcessorRuntime<
  import("effect").Effect.Effect.Context<ReturnType<typeof runWebhookDelivery>>
>;

type ControlJobProcessorRuntime = WorkerProcessorRuntime<
  import("effect").Effect.Effect.Context<ReturnType<typeof runControlJob>>
>;

export const createProcessSyncJob = (runtime: SyncProcessorRuntime) => {
  return (job: MailboxSyncJobData) => runtime.runPromise(runMailboxSync(job.mailboxId));
};

export const createProcessWebhookDelivery = (runtime: WebhookDeliveryProcessorRuntime) => {
  return (request: WebhookDeliveryScheduleRequest): Promise<ProcessWebhookDeliveryResult> =>
    runtime.runPromise(runWebhookDelivery(request.deliveryId));
};

export const createProcessControlJob = (runtime: ControlJobProcessorRuntime) => {
  return (request: ControlJobDispatchRequest): Promise<ControlJobRunResult> =>
    runtime.runPromise(runControlJob(request));
};
