import type { WorkerEnv } from "@mailmon/config";
import { createCorePersistenceLayer } from "@mailmon/db";
import { createStubMailboxSyncProviderLayer } from "@mailmon/gmail";
import { Layer, ManagedRuntime } from "effect";

export const createWorkerRuntimeLayer = (env: Pick<WorkerEnv, "databaseUrl">) =>
  Layer.mergeAll(createCorePersistenceLayer(env.databaseUrl), createStubMailboxSyncProviderLayer);

export const createWorkerRuntime = (env: Pick<WorkerEnv, "databaseUrl">) =>
  ManagedRuntime.make(createWorkerRuntimeLayer(env));

export type WorkerRuntime = ReturnType<typeof createWorkerRuntime>;
