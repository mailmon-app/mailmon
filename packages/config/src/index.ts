import { Config, Context, Effect, Layer, Option } from "effect";

export type NodeEnv = "development" | "test" | "production";
export type AsyncTransportMode = "local" | "gcp" | "legacy_bullmq";
export const DEFAULT_GCP_WEBHOOK_DELIVERY_QUEUE_ID = "mailmon-webhook-deliveries";

const loadNodeEnv = Config.literals(["development", "test", "production"], "NODE_ENV").pipe(
  Config.orElse(() => Config.succeed("development" as const)),
);

const loadDatabaseUrl = Config.nonEmptyString("DATABASE_URL");
const loadPort = (fallbackPort: number) =>
  Config.port("PORT").pipe(Config.orElse(() => Config.succeed(fallbackPort)));
const loadHost = Config.option(Config.nonEmptyString("HOST"));
const loadGcpProjectId = Config.option(Config.nonEmptyString("GCP_PROJECT_ID"));
const loadGcpRegion = Config.option(Config.nonEmptyString("GCP_REGION"));
const loadGmailApiBaseUrl = Config.nonEmptyString("MAILMON_GMAIL_API_BASE_URL").pipe(
  Config.orElse(() => Config.succeed("https://gmail.googleapis.com/gmail/v1")),
);
const loadGmailOauthClientId = Config.option(
  Config.nonEmptyString("MAILMON_GMAIL_OAUTH_CLIENT_ID"),
);
const loadGmailOauthClientSecret = Config.option(
  Config.nonEmptyString("MAILMON_GMAIL_OAUTH_CLIENT_SECRET"),
);
const loadGmailOauthAuthorizeUrl = Config.nonEmptyString("MAILMON_GMAIL_OAUTH_AUTHORIZE_URL").pipe(
  Config.orElse(() => Config.succeed("https://accounts.google.com/o/oauth2/v2/auth")),
);
const loadGmailRefreshTokenEncryptionKey = Config.nonEmptyString(
  "MAILMON_GMAIL_REFRESH_TOKEN_ENCRYPTION_KEY",
);
const loadGmailRefreshTokenEncryptionKeyId = Config.nonEmptyString(
  "MAILMON_GMAIL_REFRESH_TOKEN_ENCRYPTION_KEY_ID",
).pipe(Config.orElse(() => Config.succeed("primary")));
const loadGmailRefreshTokenPreviousEncryptionKeys = Config.option(
  Config.nonEmptyString("MAILMON_GMAIL_REFRESH_TOKEN_PREVIOUS_ENCRYPTION_KEYS"),
);
const loadGmailOauthTokenUrl = Config.nonEmptyString("MAILMON_GMAIL_OAUTH_TOKEN_URL").pipe(
  Config.orElse(() => Config.succeed("https://oauth2.googleapis.com/token")),
);
const loadGmailPubSubTopicName = Config.option(
  Config.nonEmptyString("MAILMON_GMAIL_PUBSUB_TOPIC_NAME"),
);
const loadSyncDispatchPubSubTopicName = Config.option(
  Config.nonEmptyString("MAILMON_SYNC_DISPATCH_PUBSUB_TOPIC_NAME"),
);
const loadMailboxWorkerBaseUrl = Config.option(Config.nonEmptyString("MAILMON_WORKER_BASE_URL"));
const loadRedisUrl = Config.option(Config.nonEmptyString("REDIS_URL"));
const loadAsyncTransportMode = Config.literals(
  ["local", "gcp", "legacy_bullmq"],
  "MAILMON_ASYNC_TRANSPORT_MODE",
).pipe(Config.orElse(() => Config.succeed("local" as const)));
const loadGcpWebhookDeliveryQueueId = Config.nonEmptyString(
  "MAILMON_GCP_WEBHOOK_DELIVERY_QUEUE_ID",
).pipe(Config.orElse(() => Config.succeed(DEFAULT_GCP_WEBHOOK_DELIVERY_QUEUE_ID)));
const loadGcpTasksServiceAccountEmail = Config.option(
  Config.nonEmptyString("MAILMON_GCP_TASKS_SERVICE_ACCOUNT_EMAIL"),
);
const loadGcpTasksAudience = Config.option(Config.nonEmptyString("MAILMON_GCP_TASKS_AUDIENCE"));
const loadGcpSchedulerServiceAccountEmail = Config.option(
  Config.nonEmptyString("MAILMON_GCP_SCHEDULER_SERVICE_ACCOUNT_EMAIL"),
);

const normalizeOptional = <T>(value: Option.Option<T>) => Option.getOrNull(value);

const defaultHostFor = (asyncTransportMode: AsyncTransportMode) =>
  asyncTransportMode === "gcp" ? "0.0.0.0" : "127.0.0.1";

const resolveWorkerBaseUrl = (
  asyncTransportMode: AsyncTransportMode,
  workerBaseUrl: string | null,
) => {
  if (workerBaseUrl !== null) {
    return workerBaseUrl;
  }

  if (asyncTransportMode === "gcp") {
    throw new Error("MAILMON_WORKER_BASE_URL is required when MAILMON_ASYNC_TRANSPORT_MODE=gcp");
  }

  return "http://127.0.0.1:3001";
};

const requireGcpValue = (value: string | null, name: string) => {
  if (value === null) {
    throw new Error(`${name} is required when MAILMON_ASYNC_TRANSPORT_MODE=gcp`);
  }

  return value;
};

export interface GmailRefreshTokenPreviousEncryptionKey {
  readonly encryptionKey: string;
  readonly keyId: string;
}

const parsePreviousEncryptionKeys = (
  value: string | null,
): ReadonlyArray<GmailRefreshTokenPreviousEncryptionKey> => {
  if (value === null) {
    return [];
  }

  return value.split(",").map((entry) => {
    const separatorIndex = entry.indexOf("=");

    if (separatorIndex <= 0 || separatorIndex === entry.length - 1) {
      throw new Error(
        "MAILMON_GMAIL_REFRESH_TOKEN_PREVIOUS_ENCRYPTION_KEYS must be comma-separated key_id=base64_key entries",
      );
    }

    return {
      encryptionKey: entry.slice(separatorIndex + 1).trim(),
      keyId: entry.slice(0, separatorIndex).trim(),
    };
  });
};

export interface CommonEnv {
  readonly nodeEnv: NodeEnv;
}

export interface ApiEnv extends CommonEnv {
  readonly asyncTransportMode: AsyncTransportMode;
  readonly databaseUrl: string;
  readonly gmailApiBaseUrl: string;
  readonly gmailOauthAuthorizeUrl: string;
  readonly gmailOauthClientId: string | null;
  readonly gmailOauthClientSecret: string | null;
  readonly gmailRefreshTokenEncryptionKey: string;
  readonly gmailRefreshTokenEncryptionKeyId: string;
  readonly gmailRefreshTokenPreviousEncryptionKeys: ReadonlyArray<GmailRefreshTokenPreviousEncryptionKey>;
  readonly gmailOauthTokenUrl: string;
  readonly syncDispatchPubSubTopicName: string | null;
  readonly host: string;
  readonly port: number;
  readonly workerBaseUrl: string;
}

export interface WorkerEnv extends CommonEnv {
  readonly asyncTransportMode: AsyncTransportMode;
  readonly databaseUrl: string;
  readonly gmailApiBaseUrl: string;
  readonly gmailOauthClientId: string | null;
  readonly gmailOauthClientSecret: string | null;
  readonly gmailRefreshTokenEncryptionKey: string;
  readonly gmailRefreshTokenEncryptionKeyId: string;
  readonly gmailRefreshTokenPreviousEncryptionKeys: ReadonlyArray<GmailRefreshTokenPreviousEncryptionKey>;
  readonly gmailOauthTokenUrl: string;
  readonly gmailPubSubTopicName: string | null;
  readonly syncDispatchPubSubTopicName: string | null;
  readonly gcpProjectId: string | null;
  readonly gcpRegion: string | null;
  readonly gcpSchedulerServiceAccountEmail: string | null;
  readonly gcpTasksAudience: string | null;
  readonly gcpTasksServiceAccountEmail: string | null;
  readonly gcpWebhookDeliveryQueueId: string;
  readonly host: string;
  readonly port: number;
  readonly redisUrl: string | null;
  readonly workerBaseUrl: string;
}

export interface CliEnv extends CommonEnv {
  readonly asyncTransportMode: AsyncTransportMode;
  readonly databaseUrl: string | null;
  readonly gmailRefreshTokenEncryptionKey: string | null;
  readonly gmailRefreshTokenEncryptionKeyId: string;
  readonly gmailRefreshTokenPreviousEncryptionKeys: ReadonlyArray<GmailRefreshTokenPreviousEncryptionKey>;
  readonly workerBaseUrl: string;
}

const commonConfig = Config.all({
  nodeEnv: loadNodeEnv,
});

const apiConfig = Config.all({
  asyncTransportMode: loadAsyncTransportMode,
  databaseUrl: loadDatabaseUrl,
  gmailApiBaseUrl: loadGmailApiBaseUrl,
  gmailOauthAuthorizeUrl: loadGmailOauthAuthorizeUrl,
  gmailOauthClientId: loadGmailOauthClientId,
  gmailOauthClientSecret: loadGmailOauthClientSecret,
  gmailRefreshTokenEncryptionKey: loadGmailRefreshTokenEncryptionKey,
  gmailRefreshTokenEncryptionKeyId: loadGmailRefreshTokenEncryptionKeyId,
  gmailRefreshTokenPreviousEncryptionKeys: loadGmailRefreshTokenPreviousEncryptionKeys,
  gmailOauthTokenUrl: loadGmailOauthTokenUrl,
  host: loadHost,
  nodeEnv: loadNodeEnv,
  port: loadPort(3000),
  syncDispatchPubSubTopicName: loadSyncDispatchPubSubTopicName,
  workerBaseUrl: loadMailboxWorkerBaseUrl,
}).pipe(
  Config.map((config): ApiEnv => {
    const syncDispatchPubSubTopicName = normalizeOptional(config.syncDispatchPubSubTopicName);
    const workerBaseUrl = resolveWorkerBaseUrl(
      config.asyncTransportMode,
      normalizeOptional(config.workerBaseUrl),
    );

    return {
      asyncTransportMode: config.asyncTransportMode,
      databaseUrl: config.databaseUrl,
      gmailApiBaseUrl: config.gmailApiBaseUrl,
      gmailOauthAuthorizeUrl: config.gmailOauthAuthorizeUrl,
      gmailOauthClientId: normalizeOptional(config.gmailOauthClientId),
      gmailOauthClientSecret: normalizeOptional(config.gmailOauthClientSecret),
      gmailRefreshTokenEncryptionKey: config.gmailRefreshTokenEncryptionKey,
      gmailRefreshTokenEncryptionKeyId: config.gmailRefreshTokenEncryptionKeyId,
      gmailRefreshTokenPreviousEncryptionKeys: parsePreviousEncryptionKeys(
        normalizeOptional(config.gmailRefreshTokenPreviousEncryptionKeys),
      ),
      gmailOauthTokenUrl: config.gmailOauthTokenUrl,
      host: Option.match(config.host, {
        onNone: () => defaultHostFor(config.asyncTransportMode),
        onSome: (value) => value,
      }),
      nodeEnv: config.nodeEnv,
      port: config.port,
      syncDispatchPubSubTopicName:
        config.asyncTransportMode === "gcp"
          ? requireGcpValue(syncDispatchPubSubTopicName, "MAILMON_SYNC_DISPATCH_PUBSUB_TOPIC_NAME")
          : syncDispatchPubSubTopicName,
      workerBaseUrl,
    };
  }),
);

const workerConfig = Config.all({
  asyncTransportMode: loadAsyncTransportMode,
  databaseUrl: loadDatabaseUrl,
  gmailApiBaseUrl: loadGmailApiBaseUrl,
  gmailOauthClientId: loadGmailOauthClientId,
  gmailOauthClientSecret: loadGmailOauthClientSecret,
  gmailRefreshTokenEncryptionKey: loadGmailRefreshTokenEncryptionKey,
  gmailRefreshTokenEncryptionKeyId: loadGmailRefreshTokenEncryptionKeyId,
  gmailRefreshTokenPreviousEncryptionKeys: loadGmailRefreshTokenPreviousEncryptionKeys,
  gmailOauthTokenUrl: loadGmailOauthTokenUrl,
  gmailPubSubTopicName: loadGmailPubSubTopicName,
  syncDispatchPubSubTopicName: loadSyncDispatchPubSubTopicName,
  gcpProjectId: loadGcpProjectId,
  gcpRegion: loadGcpRegion,
  gcpSchedulerServiceAccountEmail: loadGcpSchedulerServiceAccountEmail,
  gcpTasksAudience: loadGcpTasksAudience,
  gcpTasksServiceAccountEmail: loadGcpTasksServiceAccountEmail,
  gcpWebhookDeliveryQueueId: loadGcpWebhookDeliveryQueueId,
  host: loadHost,
  nodeEnv: loadNodeEnv,
  port: loadPort(3001),
  redisUrl: loadRedisUrl,
  workerBaseUrl: loadMailboxWorkerBaseUrl,
}).pipe(
  Config.map((config): WorkerEnv => {
    const gcpProjectId = normalizeOptional(config.gcpProjectId);
    const gcpRegion = normalizeOptional(config.gcpRegion);
    const gcpSchedulerServiceAccountEmail = normalizeOptional(
      config.gcpSchedulerServiceAccountEmail,
    );
    const gcpTasksAudience = normalizeOptional(config.gcpTasksAudience);
    const gcpTasksServiceAccountEmail = normalizeOptional(config.gcpTasksServiceAccountEmail);
    const gmailPubSubTopicName = normalizeOptional(config.gmailPubSubTopicName);
    const syncDispatchPubSubTopicName = normalizeOptional(config.syncDispatchPubSubTopicName);

    return {
      asyncTransportMode: config.asyncTransportMode,
      databaseUrl: config.databaseUrl,
      gcpProjectId:
        config.asyncTransportMode === "gcp"
          ? requireGcpValue(gcpProjectId, "GCP_PROJECT_ID")
          : gcpProjectId,
      gcpRegion:
        config.asyncTransportMode === "gcp" ? requireGcpValue(gcpRegion, "GCP_REGION") : gcpRegion,
      gcpSchedulerServiceAccountEmail:
        config.asyncTransportMode === "gcp"
          ? requireGcpValue(
              gcpSchedulerServiceAccountEmail,
              "MAILMON_GCP_SCHEDULER_SERVICE_ACCOUNT_EMAIL",
            )
          : gcpSchedulerServiceAccountEmail,
      gcpTasksAudience,
      gcpTasksServiceAccountEmail:
        config.asyncTransportMode === "gcp"
          ? requireGcpValue(gcpTasksServiceAccountEmail, "MAILMON_GCP_TASKS_SERVICE_ACCOUNT_EMAIL")
          : gcpTasksServiceAccountEmail,
      gcpWebhookDeliveryQueueId: config.gcpWebhookDeliveryQueueId,
      gmailApiBaseUrl: config.gmailApiBaseUrl,
      gmailOauthClientId: normalizeOptional(config.gmailOauthClientId),
      gmailOauthClientSecret: normalizeOptional(config.gmailOauthClientSecret),
      gmailPubSubTopicName:
        config.asyncTransportMode === "gcp"
          ? requireGcpValue(gmailPubSubTopicName, "MAILMON_GMAIL_PUBSUB_TOPIC_NAME")
          : gmailPubSubTopicName,
      gmailRefreshTokenEncryptionKey: config.gmailRefreshTokenEncryptionKey,
      gmailRefreshTokenEncryptionKeyId: config.gmailRefreshTokenEncryptionKeyId,
      gmailRefreshTokenPreviousEncryptionKeys: parsePreviousEncryptionKeys(
        normalizeOptional(config.gmailRefreshTokenPreviousEncryptionKeys),
      ),
      gmailOauthTokenUrl: config.gmailOauthTokenUrl,
      host: Option.match(config.host, {
        onNone: () => defaultHostFor(config.asyncTransportMode),
        onSome: (value) => value,
      }),
      nodeEnv: config.nodeEnv,
      port: config.port,
      redisUrl: normalizeOptional(config.redisUrl),
      syncDispatchPubSubTopicName:
        config.asyncTransportMode === "gcp"
          ? requireGcpValue(syncDispatchPubSubTopicName, "MAILMON_SYNC_DISPATCH_PUBSUB_TOPIC_NAME")
          : syncDispatchPubSubTopicName,
      workerBaseUrl: resolveWorkerBaseUrl(
        config.asyncTransportMode,
        normalizeOptional(config.workerBaseUrl),
      ),
    };
  }),
);

const cliConfig = Config.all({
  asyncTransportMode: loadAsyncTransportMode,
  databaseUrl: Config.option(loadDatabaseUrl),
  gmailRefreshTokenEncryptionKey: Config.option(loadGmailRefreshTokenEncryptionKey),
  gmailRefreshTokenEncryptionKeyId: loadGmailRefreshTokenEncryptionKeyId,
  gmailRefreshTokenPreviousEncryptionKeys: loadGmailRefreshTokenPreviousEncryptionKeys,
  nodeEnv: loadNodeEnv,
  workerBaseUrl: loadMailboxWorkerBaseUrl,
}).pipe(
  Config.map(
    (config): CliEnv => ({
      asyncTransportMode: config.asyncTransportMode,
      databaseUrl: normalizeOptional(config.databaseUrl),
      gmailRefreshTokenEncryptionKey: normalizeOptional(config.gmailRefreshTokenEncryptionKey),
      gmailRefreshTokenEncryptionKeyId: config.gmailRefreshTokenEncryptionKeyId,
      gmailRefreshTokenPreviousEncryptionKeys: parsePreviousEncryptionKeys(
        normalizeOptional(config.gmailRefreshTokenPreviousEncryptionKeys),
      ),
      nodeEnv: config.nodeEnv,
      workerBaseUrl: resolveWorkerBaseUrl(
        config.asyncTransportMode,
        normalizeOptional(config.workerBaseUrl),
      ),
    }),
  ),
);

export class CommonConfig extends Context.Service<CommonConfig, CommonEnv>()(
  "@mailmon/config/CommonConfig",
) {
  static readonly layer = Layer.effect(this, commonConfig.asEffect());

  static readonly testLayer = Layer.succeed(this, {
    nodeEnv: "test",
  } satisfies CommonEnv);
}

export class ApiConfig extends Context.Service<ApiConfig, ApiEnv>()("@mailmon/config/ApiConfig") {
  static readonly layer = Layer.effect(this, apiConfig.asEffect());

  static readonly testLayer = Layer.succeed(this, {
    asyncTransportMode: "local",
    databaseUrl: "postgres://mailmon:mailmon@localhost:5432/mailmon",
    gmailApiBaseUrl: "https://gmail.googleapis.com/gmail/v1",
    gmailOauthAuthorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    gmailOauthClientId: null,
    gmailOauthClientSecret: null,
    gmailRefreshTokenEncryptionKey: "BwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwc=",
    gmailRefreshTokenEncryptionKeyId: "primary",
    gmailRefreshTokenPreviousEncryptionKeys: [],
    gmailOauthTokenUrl: "https://oauth2.googleapis.com/token",
    syncDispatchPubSubTopicName: null,
    host: "127.0.0.1",
    nodeEnv: "test",
    port: 3000,
    workerBaseUrl: "http://127.0.0.1:3001",
  } satisfies ApiEnv);
}

export class WorkerConfig extends Context.Service<WorkerConfig, WorkerEnv>()(
  "@mailmon/config/WorkerConfig",
) {
  static readonly layer = Layer.effect(this, workerConfig.asEffect());

  static readonly testLayer = Layer.succeed(this, {
    asyncTransportMode: "local",
    databaseUrl: "postgres://mailmon:mailmon@localhost:5432/mailmon",
    gmailApiBaseUrl: "https://gmail.googleapis.com/gmail/v1",
    gmailOauthClientId: null,
    gmailOauthClientSecret: null,
    gmailRefreshTokenEncryptionKey: "BwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwc=",
    gmailRefreshTokenEncryptionKeyId: "primary",
    gmailRefreshTokenPreviousEncryptionKeys: [],
    gmailOauthTokenUrl: "https://oauth2.googleapis.com/token",
    gmailPubSubTopicName: null,
    syncDispatchPubSubTopicName: null,
    gcpProjectId: null,
    gcpRegion: null,
    gcpSchedulerServiceAccountEmail: null,
    gcpTasksAudience: null,
    gcpTasksServiceAccountEmail: null,
    gcpWebhookDeliveryQueueId: DEFAULT_GCP_WEBHOOK_DELIVERY_QUEUE_ID,
    host: "127.0.0.1",
    nodeEnv: "test",
    port: 3001,
    redisUrl: null,
    workerBaseUrl: "http://127.0.0.1:3001",
  } satisfies WorkerEnv);
}

export class CliConfig extends Context.Service<CliConfig, CliEnv>()("@mailmon/config/CliConfig") {
  static readonly layer = Layer.effect(this, cliConfig.asEffect());

  static readonly testLayer = Layer.succeed(this, {
    asyncTransportMode: "local",
    databaseUrl: null,
    gmailRefreshTokenEncryptionKey: null,
    gmailRefreshTokenEncryptionKeyId: "primary",
    gmailRefreshTokenPreviousEncryptionKeys: [],
    nodeEnv: "test",
    workerBaseUrl: "http://127.0.0.1:3001",
  } satisfies CliEnv);
}

export const loadCommonEnv = (): CommonEnv =>
  Effect.runSync(CommonConfig.asEffect().pipe(Effect.provide(CommonConfig.layer)));

export const loadApiEnv = (): ApiEnv =>
  Effect.runSync(ApiConfig.asEffect().pipe(Effect.provide(ApiConfig.layer)));

export const loadWorkerEnv = (): WorkerEnv =>
  Effect.runSync(WorkerConfig.asEffect().pipe(Effect.provide(WorkerConfig.layer)));

export const loadCliEnv = (): CliEnv =>
  Effect.runSync(CliConfig.asEffect().pipe(Effect.provide(CliConfig.layer)));
