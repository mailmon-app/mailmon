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

type ApiRuntimeEnv = Pick<
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
>;

const createMailboxSyncDispatcherLayer = (env: ApiRuntimeEnv) => {
  switch (env.asyncTransportMode) {
    case "gcp":
      return createGcpMailboxSyncDispatcherLayer({
        topicName: requireGcpApiValue(
          env.syncDispatchPubSubTopicName,
          "MAILMON_SYNC_DISPATCH_PUBSUB_TOPIC_NAME",
        ),
      });
    case "local":
      return createWorkerHttpMailboxSyncDispatcherLayer({
        workerBaseUrl: env.workerBaseUrl,
      });
    case "legacy_bullmq":
      throw new Error(
        "apps/api does not support MAILMON_ASYNC_TRANSPORT_MODE=legacy_bullmq; use local or gcp",
      );
  }

  throw new Error("Unsupported MAILMON_ASYNC_TRANSPORT_MODE");
};

export const createApiRuntimeLayer = (env: ApiRuntimeEnv) => {
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
  const mailboxSyncDispatcherLayer = createMailboxSyncDispatcherLayer(env);

  return Layer.mergeAll(persistenceLayer, mailboxConnectProviderLayer, mailboxSyncDispatcherLayer);
};

export const createApiRuntime = (env: ApiRuntimeEnv) => {
  return ManagedRuntime.make(createApiRuntimeLayer(env));
};
