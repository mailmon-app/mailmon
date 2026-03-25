import {
  MailboxCatalog,
  MailboxSyncCoordinator,
  MailboxSyncProvider,
  SyncRunStore,
  type MailboxSyncJobData,
  runMailboxSync,
} from "@mailmon/core";

export interface WorkerSyncProcessorRuntime {
  readonly runPromise: <A, E>(
    effect: import("effect").Effect.Effect<
      A,
      E,
      MailboxCatalog | MailboxSyncCoordinator | MailboxSyncProvider | SyncRunStore
    >,
    options?: {
      readonly signal?: AbortSignal;
    },
  ) => Promise<A>;
}

export const createProcessSyncJob = (runtime: WorkerSyncProcessorRuntime) => {
  return (job: MailboxSyncJobData) => runtime.runPromise(runMailboxSync(job.mailboxId));
};
