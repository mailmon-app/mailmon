import { pathToFileURL } from "node:url";

import type { WorkerEnv } from "@mailmon/config";
import { loadWorkerEnv } from "@mailmon/config";
import type {
  ControlJobDispatchRequest,
  ControlJobRunResult,
  ProcessWebhookDeliveryResult,
  WebhookDeliveryScheduleRequest,
} from "@mailmon/core";
import { recoverWebhookDeliveryScheduling, runControlJob } from "@mailmon/core";
import { createGcpWebhookDeliverySchedulerLayer } from "@mailmon/queue";
import { Layer, ManagedRuntime } from "effect";

import { createProcessSyncJob, createProcessWebhookDelivery } from "./processor.js";
import {
  createInProcessWebhookDeliverySchedulerLayer,
  createWorkerRuntimeLayer,
} from "./runtime.js";
import { startWorkerHttpRuntime } from "./server.js";

export interface WorkerRuntimeHandle {
  readonly close: () => Promise<void>;
  readonly kind: "http" | "legacy_bullmq";
}

const requireGcpWorkerValue = (value: string | null, name: string) => {
  if (value === null) {
    throw new Error(`${name} is required when MAILMON_ASYNC_TRANSPORT_MODE=gcp`);
  }

  return value;
};

const createWorkerProcessorRuntime = (
  env: Pick<
    WorkerEnv,
    | "asyncTransportMode"
    | "databaseUrl"
    | "gmailApiBaseUrl"
    | "gmailOauthClientId"
    | "gmailOauthClientSecret"
    | "gmailRefreshTokenEncryptionKey"
    | "gmailRefreshTokenEncryptionKeyId"
    | "gmailRefreshTokenPreviousEncryptionKeys"
    | "gmailOauthTokenUrl"
    | "gmailPubSubTopicName"
    | "gcpProjectId"
    | "gcpRegion"
    | "gcpTasksAudience"
    | "gcpTasksServiceAccountEmail"
    | "gcpWebhookDeliveryQueueId"
    | "nodeEnv"
    | "workerBaseUrl"
  >,
) => {
  let setDispatch:
    | ((
        dispatch: (
          request: WebhookDeliveryScheduleRequest,
        ) => Promise<ProcessWebhookDeliveryResult>,
      ) => void)
    | null = null;
  const schedulerLayer =
    env.asyncTransportMode === "gcp"
      ? createGcpWebhookDeliverySchedulerLayer({
          location: requireGcpWorkerValue(env.gcpRegion, "GCP_REGION"),
          projectId: requireGcpWorkerValue(env.gcpProjectId, "GCP_PROJECT_ID"),
          queueId: env.gcpWebhookDeliveryQueueId,
          serviceAccountEmail: env.gcpTasksServiceAccountEmail,
          workerAudience: env.gcpTasksAudience,
          workerBaseUrl: env.workerBaseUrl,
        })
      : (() => {
          let dispatchWebhookDelivery:
            | ((request: WebhookDeliveryScheduleRequest) => Promise<ProcessWebhookDeliveryResult>)
            | null = null;

          setDispatch = (dispatch) => {
            dispatchWebhookDelivery = dispatch;
          };

          return createInProcessWebhookDeliverySchedulerLayer({
            dispatch: (request) => {
              if (dispatchWebhookDelivery === null) {
                return Promise.reject(
                  new Error("Webhook delivery processor was not initialized before scheduling."),
                );
              }

              return dispatchWebhookDelivery(request);
            },
            onDispatchError: (error, request) => {
              console.error(`scheduled webhook delivery ${request.deliveryId} failed`, error);
            },
          });
        })();
  const runtime = ManagedRuntime.make(
    Layer.mergeAll(createWorkerRuntimeLayer(env), schedulerLayer),
  );
  const processControlJob = (request: ControlJobDispatchRequest): Promise<ControlJobRunResult> => {
    const controlJob = runControlJob(request);

    // oxlint-disable-next-line typescript-eslint/no-unsafe-type-assertion -- the worker runtime layer provides MailboxWatchStore and MailboxWatchProvider; ManagedRuntime's R type is the full service union.
    return runtime.runPromise(
      controlJob as Parameters<typeof runtime.runPromise>[0],
    ) as Promise<ControlJobRunResult>;
  };
  const processSyncJob = createProcessSyncJob(runtime);
  const processWebhookDelivery = createProcessWebhookDelivery(runtime);

  if (setDispatch !== null) {
    setDispatch(processWebhookDelivery);
  }

  return {
    recoverWebhookDeliveries: () => runtime.runPromise(recoverWebhookDeliveryScheduling()),
    runtime,
    processControlJob,
    processSyncJob,
    processWebhookDelivery,
  };
};

const startLegacyBullmqWorkerRuntime = async (env: WorkerEnv): Promise<WorkerRuntimeHandle> => {
  if (env.redisUrl === null) {
    throw new Error("REDIS_URL is required when MAILMON_ASYNC_TRANSPORT_MODE=legacy_bullmq");
  }

  const effectRuntime = createWorkerProcessorRuntime(env);
  const recoveredWebhookDeliveries = await effectRuntime.recoverWebhookDeliveries();

  if (recoveredWebhookDeliveries.length > 0) {
    console.log(
      `recovered ${recoveredWebhookDeliveries.length} durable webhook deliveries for retry scheduling`,
    );
  }
  const [{ Worker }, { createRedisConnectionOptions, SYNC_MAILBOX_QUEUE }] = await Promise.all([
    import("bullmq"),
    import("@mailmon/queue"),
  ]);

  const connection = createRedisConnectionOptions(env.redisUrl);
  const worker = new Worker(
    SYNC_MAILBOX_QUEUE,
    async (job) => {
      await effectRuntime.processSyncJob(job.data);
    },
    {
      connection,
    },
  );

  worker.on("completed", (job) => {
    console.log(`completed legacy bullmq job ${job.id}`);
  });

  worker.on("failed", (job, error) => {
    console.error(`legacy bullmq job ${job?.id ?? "unknown"} failed`, error);
  });

  return {
    close: async () => {
      await worker.close();
      await effectRuntime.runtime.dispose();
    },
    kind: "legacy_bullmq",
  };
};

const startHttpWorkerRuntime = async (env: WorkerEnv): Promise<WorkerRuntimeHandle> => {
  const effectRuntime = createWorkerProcessorRuntime(env);
  const recoveredWebhookDeliveries = await effectRuntime.recoverWebhookDeliveries();

  if (recoveredWebhookDeliveries.length > 0) {
    console.log(
      `recovered ${recoveredWebhookDeliveries.length} durable webhook deliveries for retry scheduling`,
    );
  }
  const httpRuntime = await startWorkerHttpRuntime({
    asyncTransportMode: env.asyncTransportMode,
    host: env.host,
    port: env.port,
    processControlJob: effectRuntime.processControlJob,
    processSyncJob: effectRuntime.processSyncJob,
    processWebhookDelivery: effectRuntime.processWebhookDelivery,
  });

  console.log(
    `worker listening on http://${httpRuntime.host}:${httpRuntime.port} using ${env.asyncTransportMode} async transport`,
  );

  return {
    close: async () => {
      await httpRuntime.close();
      await effectRuntime.runtime.dispose();
    },
    kind: "http",
  };
};

export const startWorkerRuntime = async (env: WorkerEnv): Promise<WorkerRuntimeHandle> => {
  if (env.asyncTransportMode === "legacy_bullmq") {
    return startLegacyBullmqWorkerRuntime(env);
  }

  return startHttpWorkerRuntime(env);
};

export const main = async () => {
  const env = loadWorkerEnv();
  const runtime = await startWorkerRuntime(env);
  const shutdown = async () => {
    await runtime.close();
  };

  process.on("SIGINT", () => {
    void shutdown();
  });

  process.on("SIGTERM", () => {
    void shutdown();
  });

  return runtime;
};

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main();
}
