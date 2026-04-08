import type { ApiEnv } from "@mailmon/config";
import { createCorePersistenceLayer } from "@mailmon/db";
import { createHttpGmailConnectProviderLayer } from "@mailmon/gmail";
import { createLocalAsyncTransportLayer } from "@mailmon/queue";
import { Layer, ManagedRuntime } from "effect";

export const createApiRuntimeLayer = (
  env: Pick<
    ApiEnv,
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
  const localAsyncTransportLayer = createLocalAsyncTransportLayer({
    workerBaseUrl: env.workerBaseUrl,
  });

  return Layer.mergeAll(persistenceLayer, mailboxConnectProviderLayer, localAsyncTransportLayer);
};

export const createApiRuntime = (
  env: Pick<
    ApiEnv,
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

export type ApiRuntime = ReturnType<typeof createApiRuntime>;
