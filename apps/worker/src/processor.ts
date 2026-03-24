import { type MailboxSyncJobData, runMailboxSync } from "@mailmon/core";
import { Effect } from "effect";

import { workerRuntimeLayer } from "./runtime.js";

export const processSyncJob = (job: MailboxSyncJobData) => {
  return Effect.runPromise(runMailboxSync(job.mailboxId).pipe(Effect.provide(workerRuntimeLayer)));
};
