import type { WorkerEnv } from "@mailmon/config";
import { createWorkerPersistenceLayer } from "@mailmon/db";
import { createHttpGmailSyncProviderLayer } from "@mailmon/gmail";
import { Layer, ManagedRuntime } from "effect";

export const createWorkerRuntimeLayer = (
  env: Pick<
    WorkerEnv,
    | "databaseUrl"
    | "gmailApiBaseUrl"
    | "gmailOauthClientId"
    | "gmailOauthClientSecret"
    | "gmailOauthTokenUrl"
  >,
) => {
  const persistenceLayer = createWorkerPersistenceLayer(env.databaseUrl);
  const gmailSyncProviderLayer = createHttpGmailSyncProviderLayer({
    apiBaseUrl: env.gmailApiBaseUrl,
    oauthClientId: env.gmailOauthClientId,
    oauthClientSecret: env.gmailOauthClientSecret,
    oauthTokenUrl: env.gmailOauthTokenUrl,
  }).pipe(Layer.provide(persistenceLayer));

  return Layer.mergeAll(persistenceLayer, gmailSyncProviderLayer);
};

export const createWorkerRuntime = (
  env: Pick<
    WorkerEnv,
    | "databaseUrl"
    | "gmailApiBaseUrl"
    | "gmailOauthClientId"
    | "gmailOauthClientSecret"
    | "gmailOauthTokenUrl"
  >,
) => ManagedRuntime.make(createWorkerRuntimeLayer(env));

export type WorkerRuntime = ReturnType<typeof createWorkerRuntime>;
