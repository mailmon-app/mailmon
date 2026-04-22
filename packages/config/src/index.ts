import { Config, Context, Effect, Layer, Option } from "effect";

const nonEmptyString = (name: string) =>
  Config.string(name).pipe(
    Config.validate({
      message: `${name} must be a non-empty string`,
      validation: (value) => value.length > 0,
    }),
  );

export type NodeEnv = "development" | "test" | "production";
export type AsyncTransportMode = "local" | "gcp" | "legacy_bullmq";
export const DEFAULT_GCP_WEBHOOK_DELIVERY_QUEUE_ID = "mailmon-webhook-deliveries";

const loadNodeEnv: Config.Config<NodeEnv> = Config.literal(
  "development",
  "test",
  "production",
)("NODE_ENV").pipe(Config.orElse(() => Config.succeed("development" as const)));

const loadDatabaseUrl = nonEmptyString("DATABASE_URL");
const loadPort = (fallbackPort: number) =>
  Config.port("PORT").pipe(Config.orElse(() => Config.succeed(fallbackPort)));
const loadHost = Config.option(nonEmptyString("HOST"));
const loadGcpProjectId = Config.option(nonEmptyString("GCP_PROJECT_ID"));
const loadGcpRegion = Config.option(nonEmptyString("GCP_REGION"));
const loadGmailApiBaseUrl = nonEmptyString("MAILMON_GMAIL_API_BASE_URL").pipe(
  Config.orElse(() => Config.succeed("https://gmail.googleapis.com/gmail/v1")),
);
const loadGmailOauthClientId = Config.option(nonEmptyString("MAILMON_GMAIL_OAUTH_CLIENT_ID"));
const loadGmailOauthClientSecret = Config.option(
  nonEmptyString("MAILMON_GMAIL_OAUTH_CLIENT_SECRET"),
);
const loadGmailOauthAuthorizeUrl = nonEmptyString("MAILMON_GMAIL_OAUTH_AUTHORIZE_URL").pipe(
  Config.orElse(() => Config.succeed("https://accounts.google.com/o/oauth2/v2/auth")),
);
const loadGmailRefreshTokenEncryptionKey = nonEmptyString(
  "MAILMON_GMAIL_REFRESH_TOKEN_ENCRYPTION_KEY",
);
const loadGmailRefreshTokenEncryptionKeyId = nonEmptyString(
  "MAILMON_GMAIL_REFRESH_TOKEN_ENCRYPTION_KEY_ID",
).pipe(Config.orElse(() => Config.succeed("primary")));
const loadGmailRefreshTokenPreviousEncryptionKeys = Config.option(
  nonEmptyString("MAILMON_GMAIL_REFRESH_TOKEN_PREVIOUS_ENCRYPTION_KEYS"),
);
const loadGmailOauthTokenUrl = nonEmptyString("MAILMON_GMAIL_OAUTH_TOKEN_URL").pipe(
  Config.orElse(() => Config.succeed("https://oauth2.googleapis.com/token")),
);
const loadGmailPubSubTopicName = Config.option(nonEmptyString("MAILMON_GMAIL_PUBSUB_TOPIC_NAME"));
const loadMailboxWorkerBaseUrl = Config.option(nonEmptyString("MAILMON_WORKER_BASE_URL"));
const loadRedisUrl = Config.option(nonEmptyString("REDIS_URL"));
const loadAsyncTransportMode: Config.Config<AsyncTransportMode> = Config.literal(
  "local",
  "gcp",
  "legacy_bullmq",
)("MAILMON_ASYNC_TRANSPORT_MODE").pipe(Config.orElse(() => Config.succeed("local" as const)));
const loadGcpWebhookDeliveryQueueId = nonEmptyString("MAILMON_GCP_WEBHOOK_DELIVERY_QUEUE_ID").pipe(
  Config.orElse(() => Config.succeed(DEFAULT_GCP_WEBHOOK_DELIVERY_QUEUE_ID)),
);
const loadGcpTasksServiceAccountEmail = Config.option(
  nonEmptyString("MAILMON_GCP_TASKS_SERVICE_ACCOUNT_EMAIL"),
);
const loadGcpTasksAudience = Config.option(nonEmptyString("MAILMON_GCP_TASKS_AUDIENCE"));

const normalizeOptional = <T>(value: Option.Option<T>) => {
  return Option.getOrNull(value);
};

const resolveWorkerBaseUrl = (
  asyncTransportMode: AsyncTransportMode,
  workerBaseUrl: Option.Option<string>,
) => {
  return Option.match(workerBaseUrl, {
    onNone: () => {
      if (asyncTransportMode === "gcp") {
        throw new Error(
          "MAILMON_WORKER_BASE_URL is required when MAILMON_ASYNC_TRANSPORT_MODE=gcp",
        );
      }

      return "http://127.0.0.1:3001";
    },
    onSome: (value) => value,
  });
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
  value: Option.Option<string>,
): ReadonlyArray<GmailRefreshTokenPreviousEncryptionKey> => {
  return Option.match(value, {
    onNone: () => [],
    onSome: (rawValue) => {
      return rawValue.split(",").map((entry) => {
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
    },
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
  readonly gcpProjectId: string | null;
  readonly gcpRegion: string | null;
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

export class CommonConfig extends Context.Tag("@mailmon/config/CommonConfig")<
  CommonConfig,
  CommonEnv
>() {
  static readonly layer = Layer.effect(
    this,
    Effect.all({
      nodeEnv: loadNodeEnv,
    }),
  );

  static readonly testLayer = Layer.succeed(this, {
    nodeEnv: "test",
  } satisfies CommonEnv);
}

export class ApiConfig extends Context.Tag("@mailmon/config/ApiConfig")<ApiConfig, ApiEnv>() {
  static readonly layer = Layer.effect(
    this,
    Effect.all({
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
      nodeEnv: loadNodeEnv,
      port: loadPort(3000),
      workerBaseUrl: loadMailboxWorkerBaseUrl,
    }).pipe(
      Effect.map((config) => ({
        asyncTransportMode: config.asyncTransportMode,
        databaseUrl: config.databaseUrl,
        gmailApiBaseUrl: config.gmailApiBaseUrl,
        gmailOauthAuthorizeUrl: config.gmailOauthAuthorizeUrl,
        gmailOauthClientId: normalizeOptional(config.gmailOauthClientId),
        gmailOauthClientSecret: normalizeOptional(config.gmailOauthClientSecret),
        gmailRefreshTokenEncryptionKey: config.gmailRefreshTokenEncryptionKey,
        gmailRefreshTokenEncryptionKeyId: config.gmailRefreshTokenEncryptionKeyId,
        gmailRefreshTokenPreviousEncryptionKeys: parsePreviousEncryptionKeys(
          config.gmailRefreshTokenPreviousEncryptionKeys,
        ),
        gmailOauthTokenUrl: config.gmailOauthTokenUrl,
        nodeEnv: config.nodeEnv,
        port: config.port,
        workerBaseUrl: resolveWorkerBaseUrl(config.asyncTransportMode, config.workerBaseUrl),
      })),
    ),
  );

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
    nodeEnv: "test",
    port: 3000,
    workerBaseUrl: "http://127.0.0.1:3001",
  } satisfies ApiEnv);
}

export class WorkerConfig extends Context.Tag("@mailmon/config/WorkerConfig")<
  WorkerConfig,
  WorkerEnv
>() {
  static readonly layer = Layer.effect(
    this,
    Effect.all({
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
      gcpProjectId: loadGcpProjectId,
      gcpRegion: loadGcpRegion,
      gcpTasksAudience: loadGcpTasksAudience,
      gcpTasksServiceAccountEmail: loadGcpTasksServiceAccountEmail,
      gcpWebhookDeliveryQueueId: loadGcpWebhookDeliveryQueueId,
      host: loadHost,
      nodeEnv: loadNodeEnv,
      port: loadPort(3001),
      redisUrl: loadRedisUrl,
      workerBaseUrl: loadMailboxWorkerBaseUrl,
    }).pipe(
      Effect.map((config) => ({
        asyncTransportMode: config.asyncTransportMode,
        databaseUrl: config.databaseUrl,
        gmailApiBaseUrl: config.gmailApiBaseUrl,
        gmailOauthClientId: normalizeOptional(config.gmailOauthClientId),
        gmailOauthClientSecret: normalizeOptional(config.gmailOauthClientSecret),
        gmailRefreshTokenEncryptionKey: config.gmailRefreshTokenEncryptionKey,
        gmailRefreshTokenEncryptionKeyId: config.gmailRefreshTokenEncryptionKeyId,
        gmailRefreshTokenPreviousEncryptionKeys: parsePreviousEncryptionKeys(
          config.gmailRefreshTokenPreviousEncryptionKeys,
        ),
        gmailOauthTokenUrl: config.gmailOauthTokenUrl,
        gmailPubSubTopicName: normalizeOptional(config.gmailPubSubTopicName),
        gcpProjectId: normalizeOptional(config.gcpProjectId),
        gcpRegion: normalizeOptional(config.gcpRegion),
        gcpTasksAudience: normalizeOptional(config.gcpTasksAudience),
        gcpTasksServiceAccountEmail: normalizeOptional(config.gcpTasksServiceAccountEmail),
        gcpWebhookDeliveryQueueId: config.gcpWebhookDeliveryQueueId,
        host: Option.match(config.host, {
          onNone: () => (config.asyncTransportMode === "gcp" ? "0.0.0.0" : "127.0.0.1"),
          onSome: (value) => value,
        }),
        nodeEnv: config.nodeEnv,
        port: config.port,
        redisUrl: normalizeOptional(config.redisUrl),
        workerBaseUrl: resolveWorkerBaseUrl(config.asyncTransportMode, config.workerBaseUrl),
      })),
      Effect.map((config) => ({
        ...config,
        gcpProjectId:
          config.asyncTransportMode === "gcp"
            ? requireGcpValue(config.gcpProjectId, "GCP_PROJECT_ID")
            : config.gcpProjectId,
        gcpRegion:
          config.asyncTransportMode === "gcp"
            ? requireGcpValue(config.gcpRegion, "GCP_REGION")
            : config.gcpRegion,
        gmailPubSubTopicName:
          config.asyncTransportMode === "gcp"
            ? requireGcpValue(config.gmailPubSubTopicName, "MAILMON_GMAIL_PUBSUB_TOPIC_NAME")
            : config.gmailPubSubTopicName,
      })),
    ),
  );

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
    gcpProjectId: null,
    gcpRegion: null,
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

export class CliConfig extends Context.Tag("@mailmon/config/CliConfig")<CliConfig, CliEnv>() {
  static readonly layer = Layer.effect(
    this,
    Effect.all({
      asyncTransportMode: loadAsyncTransportMode,
      databaseUrl: Config.option(loadDatabaseUrl),
      gmailRefreshTokenEncryptionKey: Config.option(loadGmailRefreshTokenEncryptionKey),
      gmailRefreshTokenEncryptionKeyId: loadGmailRefreshTokenEncryptionKeyId,
      gmailRefreshTokenPreviousEncryptionKeys: loadGmailRefreshTokenPreviousEncryptionKeys,
      nodeEnv: loadNodeEnv,
      workerBaseUrl: loadMailboxWorkerBaseUrl,
    }).pipe(
      Effect.map((config) => ({
        asyncTransportMode: config.asyncTransportMode,
        databaseUrl: normalizeOptional(config.databaseUrl),
        gmailRefreshTokenEncryptionKey: normalizeOptional(config.gmailRefreshTokenEncryptionKey),
        gmailRefreshTokenEncryptionKeyId: config.gmailRefreshTokenEncryptionKeyId,
        gmailRefreshTokenPreviousEncryptionKeys: parsePreviousEncryptionKeys(
          config.gmailRefreshTokenPreviousEncryptionKeys,
        ),
        nodeEnv: config.nodeEnv,
        workerBaseUrl: resolveWorkerBaseUrl(config.asyncTransportMode, config.workerBaseUrl),
      })),
    ),
  );

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

export const loadCommonEnv = (): CommonEnv => {
  return Effect.runSync(CommonConfig.pipe(Effect.provide(CommonConfig.layer)));
};

export const loadApiEnv = (): ApiEnv => {
  return Effect.runSync(ApiConfig.pipe(Effect.provide(ApiConfig.layer)));
};

export const loadWorkerEnv = (): WorkerEnv => {
  return Effect.runSync(WorkerConfig.pipe(Effect.provide(WorkerConfig.layer)));
};

export const loadCliEnv = (): CliEnv => {
  return Effect.runSync(CliConfig.pipe(Effect.provide(CliConfig.layer)));
};
