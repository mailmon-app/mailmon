import { pathToFileURL } from "node:url";

import type { WorkerEnv } from "@mailmon/config";
import { loadWorkerEnv } from "@mailmon/config";

import { processSyncJob } from "./processor.js";
import { startWorkerHttpRuntime } from "./server.js";

export interface WorkerRuntimeHandle {
  readonly close: () => Promise<void>;
  readonly kind: "http" | "legacy_bullmq";
}

const startLegacyBullmqWorkerRuntime = async (env: WorkerEnv): Promise<WorkerRuntimeHandle> => {
  if (env.redisUrl === null) {
    throw new Error("REDIS_URL is required when MAILMON_ASYNC_TRANSPORT_MODE=legacy_bullmq");
  }

  const [{ Worker }, { createRedisConnectionOptions, SYNC_MAILBOX_QUEUE }] = await Promise.all([
    import("bullmq"),
    import("@mailmon/queue"),
  ]);

  const connection = createRedisConnectionOptions(env.redisUrl);
  const worker = new Worker(
    SYNC_MAILBOX_QUEUE,
    async (job) => {
      await processSyncJob(job.data);
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
    close: () => worker.close(),
    kind: "legacy_bullmq",
  };
};

const startHttpWorkerRuntime = async (env: WorkerEnv): Promise<WorkerRuntimeHandle> => {
  const runtime = await startWorkerHttpRuntime({
    asyncTransportMode: env.asyncTransportMode,
    host: env.host,
    port: env.port,
    processSyncJob,
  });

  console.log(
    `worker listening on http://${runtime.host}:${runtime.port} using ${env.asyncTransportMode} async transport`,
  );

  return {
    close: runtime.close,
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
