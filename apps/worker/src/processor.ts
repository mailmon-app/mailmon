import type { SyncJobData } from "@mailmon/queue";

export const processSyncJob = async (job: SyncJobData): Promise<SyncJobData> => {
  return job;
};
