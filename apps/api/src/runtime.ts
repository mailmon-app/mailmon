import type { ApiEnv } from "@mailmon/config";
import { createCorePersistenceLayer } from "@mailmon/db";
import {
  createAesGcmGmailRefreshTokenCipherLayer,
  createHttpGmailConnectProviderLayer,
} from "@mailmon/gmail";
import {
  createGcpMailboxSyncDispatcherLayer,
  createWorkerHttpMailboxSyncDispatcherLayer,
} from "@mailmon/queue";
import { Layer, ManagedRuntime } from "effect";

const requireGcpApiValue = (value: string | null, name: string) => {
  if (value === null) {
    throw new Error(`${name} is required when MAILMON_ASYNC_TRANSPORT_MODE=gcp`);
  }

  return value;
};

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
    | "syncDispatchPubSubTopicName"
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

  const mailboxSyncDispatcherLayer =
    env.asyncTransportMode === "gcp"
      ? createGcpMailboxSyncDispatcherLayer({
          topicName: requireGcpApiValue(
            env.syncDispatchPubSubTopicName,
            "MAILMON_SYNC_DISPATCH_PUBSUB_TOPIC_NAME",
          ),
        })
      : createWorkerHttpMailboxSyncDispatcherLayer({
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
    | "syncDispatchPubSubTopicName"
    | "workerBaseUrl"
  >,
) => {
  return ManagedRuntime.make(createApiRuntimeLayer(env));
};
