import { loadWorkerEnv } from "@mailmon/config";
import { createRedisConnectionOptions, SYNC_ACCOUNT_QUEUE } from "@mailmon/queue";
import { Worker } from "bullmq";

import { processSyncJob } from "./processor.js";

const env = loadWorkerEnv();
const connection = createRedisConnectionOptions(env.redisUrl);

const worker = new Worker(
  SYNC_ACCOUNT_QUEUE,
  async (job) => {
    await processSyncJob(job.data);
  },
  {
    connection,
  },
);

worker.on("completed", (job) => {
  console.log(`completed job ${job.id}`);
});

worker.on("failed", (job, error) => {
  console.error(`job ${job?.id ?? "unknown"} failed`, error);
});

const shutdown = async () => {
  await worker.close();
};

process.on("SIGINT", () => {
  void shutdown();
});

process.on("SIGTERM", () => {
  void shutdown();
});
