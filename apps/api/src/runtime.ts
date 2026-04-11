import type { ApiEnv } from "@mailmon/config";
import { createCorePersistenceLayer } from "@mailmon/db";
import { createHttpGmailConnectProviderLayer } from "@mailmon/gmail";
import { createWorkerHttpMailboxSyncDispatcherLayer } from "@mailmon/queue";
import { Layer, ManagedRuntime } from "effect";

const createApiRuntimeLayer = (
  env: Pick<
    ApiEnv,
    | "asyncTransportMode"
    | "databaseUrl"
    | "gmailApiBaseUrl"
    | "gmailOauthAuthorizeUrl"
    | "gmailOauthClientId"
    | "gmailOauthClientSecret"
    | "gmailOauthTokenUrl"
    | "workerBaseUrl"
  >,
) => {
  const persistenceLayer = createCorePersistenceLayer(env.databaseUrl);
  const mailboxConnectProviderLayer = createHttpGmailConnectProviderLayer({
    apiBaseUrl: env.gmailApiBaseUrl,
    oauthAuthorizeUrl: env.gmailOauthAuthorizeUrl,
    oauthClientId: env.gmailOauthClientId,
    oauthClientSecret: env.gmailOauthClientSecret,
    oauthTokenUrl: env.gmailOauthTokenUrl,
  });
  const mailboxSyncDispatcherLayer = (() => {
    switch (env.asyncTransportMode) {
      case "local":
      case "gcp":
        return createWorkerHttpMailboxSyncDispatcherLayer({
          workerBaseUrl: env.workerBaseUrl,
        });
      case "legacy_bullmq":
        throw new Error(
          "apps/api does not support MAILMON_ASYNC_TRANSPORT_MODE=legacy_bullmq; use local or gcp",
        );
    }
  })();

  return Layer.mergeAll(persistenceLayer, mailboxConnectProviderLayer, mailboxSyncDispatcherLayer);
};

export const createApiRuntime = (
  env: Pick<
    ApiEnv,
    | "asyncTransportMode"
    | "databaseUrl"
    | "gmailApiBaseUrl"
    | "gmailOauthAuthorizeUrl"
    | "gmailOauthClientId"
    | "gmailOauthClientSecret"
    | "gmailOauthTokenUrl"
    | "workerBaseUrl"
  >,
) => {
  return ManagedRuntime.make(createApiRuntimeLayer(env));
};
