import type { ApiEnv } from "@mailmon/config";
import { createCorePersistenceLayer } from "@mailmon/db";
import {
  createAesGcmGmailRefreshTokenCipherLayer,
  createHttpGmailConnectProviderLayer,
} from "@mailmon/gmail";
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
    | "gmailRefreshTokenEncryptionKey"
    | "gmailRefreshTokenEncryptionKeyId"
    | "gmailRefreshTokenPreviousEncryptionKeys"
    | "gmailOauthTokenUrl"
    | "nodeEnv"
    | "workerBaseUrl"
  >,
) => {
  const gmailRefreshTokenCipherLayer = createAesGcmGmailRefreshTokenCipherLayer({
    activeKeyId: env.gmailRefreshTokenEncryptionKeyId,
    allowPlaintextFallback: env.nodeEnv !== "production",
    decryptionKeys: env.gmailRefreshTokenPreviousEncryptionKeys,
    encryptionKey: env.gmailRefreshTokenEncryptionKey,
  });
  const persistenceLayer = createCorePersistenceLayer(env.databaseUrl).pipe(
    Layer.provide(gmailRefreshTokenCipherLayer),
  );
  const mailboxConnectProviderLayer = createHttpGmailConnectProviderLayer({
    apiBaseUrl: env.gmailApiBaseUrl,
    oauthAuthorizeUrl: env.gmailOauthAuthorizeUrl,
    oauthClientId: env.gmailOauthClientId,
    oauthClientSecret: env.gmailOauthClientSecret,
    oauthTokenUrl: env.gmailOauthTokenUrl,
  });
  if (env.asyncTransportMode === "legacy_bullmq") {
    throw new Error(
      "apps/api does not support MAILMON_ASYNC_TRANSPORT_MODE=legacy_bullmq; use local or gcp",
    );
  }

  const mailboxSyncDispatcherLayer = createWorkerHttpMailboxSyncDispatcherLayer({
    workerBaseUrl: env.workerBaseUrl,
  });

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
    | "gmailRefreshTokenEncryptionKey"
    | "gmailRefreshTokenEncryptionKeyId"
    | "gmailRefreshTokenPreviousEncryptionKeys"
    | "gmailOauthTokenUrl"
    | "nodeEnv"
    | "workerBaseUrl"
  >,
) => {
  return ManagedRuntime.make(createApiRuntimeLayer(env));
};
