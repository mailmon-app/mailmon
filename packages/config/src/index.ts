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
const loadGmailOauthTokenUrl = nonEmptyString("MAILMON_GMAIL_OAUTH_TOKEN_URL").pipe(
  Config.orElse(() => Config.succeed("https://oauth2.googleapis.com/token")),
);
const loadMailboxWorkerBaseUrl = nonEmptyString("MAILMON_WORKER_BASE_URL").pipe(
  Config.orElse(() => Config.succeed("http://127.0.0.1:3001")),
);
const loadRedisUrl = Config.option(nonEmptyString("REDIS_URL"));
const loadAsyncTransportMode: Config.Config<AsyncTransportMode> = Config.literal(
  "local",
  "gcp",
  "legacy_bullmq",
)("MAILMON_ASYNC_TRANSPORT_MODE").pipe(Config.orElse(() => Config.succeed("local" as const)));

const normalizeOptional = <T>(value: Option.Option<T>) => {
  return Option.getOrNull(value);
};

export interface CommonEnv {
  readonly nodeEnv: NodeEnv;
}

export interface ApiEnv extends CommonEnv {
  readonly databaseUrl: string;
  readonly gmailApiBaseUrl: string;
  readonly gmailOauthAuthorizeUrl: string;
  readonly gmailOauthClientId: string | null;
  readonly gmailOauthClientSecret: string | null;
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
  readonly gmailOauthTokenUrl: string;
  readonly gcpProjectId: string | null;
  readonly gcpRegion: string | null;
  readonly host: string;
  readonly port: number;
  readonly redisUrl: string | null;
}

export interface CliEnv extends CommonEnv {
  readonly asyncTransportMode: AsyncTransportMode;
  readonly databaseUrl: string | null;
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
      databaseUrl: loadDatabaseUrl,
      gmailApiBaseUrl: loadGmailApiBaseUrl,
      gmailOauthAuthorizeUrl: loadGmailOauthAuthorizeUrl,
      gmailOauthClientId: loadGmailOauthClientId,
      gmailOauthClientSecret: loadGmailOauthClientSecret,
      gmailOauthTokenUrl: loadGmailOauthTokenUrl,
      nodeEnv: loadNodeEnv,
      port: loadPort(3000),
      workerBaseUrl: loadMailboxWorkerBaseUrl,
    }).pipe(
      Effect.map((config) => ({
        databaseUrl: config.databaseUrl,
        gmailApiBaseUrl: config.gmailApiBaseUrl,
        gmailOauthAuthorizeUrl: config.gmailOauthAuthorizeUrl,
        gmailOauthClientId: normalizeOptional(config.gmailOauthClientId),
        gmailOauthClientSecret: normalizeOptional(config.gmailOauthClientSecret),
        gmailOauthTokenUrl: config.gmailOauthTokenUrl,
        nodeEnv: config.nodeEnv,
        port: config.port,
        workerBaseUrl: config.workerBaseUrl,
      })),
    ),
  );

  static readonly testLayer = Layer.succeed(this, {
    databaseUrl: "postgres://mailmon:mailmon@localhost:5432/mailmon",
    gmailApiBaseUrl: "https://gmail.googleapis.com/gmail/v1",
    gmailOauthAuthorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    gmailOauthClientId: null,
    gmailOauthClientSecret: null,
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
      gmailOauthTokenUrl: loadGmailOauthTokenUrl,
      gcpProjectId: loadGcpProjectId,
      gcpRegion: loadGcpRegion,
      host: loadHost,
      nodeEnv: loadNodeEnv,
      port: loadPort(3001),
      redisUrl: loadRedisUrl,
    }).pipe(
      Effect.map((config) => ({
        asyncTransportMode: config.asyncTransportMode,
        databaseUrl: config.databaseUrl,
        gmailApiBaseUrl: config.gmailApiBaseUrl,
        gmailOauthClientId: normalizeOptional(config.gmailOauthClientId),
        gmailOauthClientSecret: normalizeOptional(config.gmailOauthClientSecret),
        gmailOauthTokenUrl: config.gmailOauthTokenUrl,
        gcpProjectId: normalizeOptional(config.gcpProjectId),
        gcpRegion: normalizeOptional(config.gcpRegion),
        host: Option.match(config.host, {
          onNone: () => (config.asyncTransportMode === "gcp" ? "0.0.0.0" : "127.0.0.1"),
          onSome: (value) => value,
        }),
        nodeEnv: config.nodeEnv,
        port: config.port,
        redisUrl: normalizeOptional(config.redisUrl),
      })),
    ),
  );

  static readonly testLayer = Layer.succeed(this, {
    asyncTransportMode: "local",
    databaseUrl: "postgres://mailmon:mailmon@localhost:5432/mailmon",
    gmailApiBaseUrl: "https://gmail.googleapis.com/gmail/v1",
    gmailOauthClientId: null,
    gmailOauthClientSecret: null,
    gmailOauthTokenUrl: "https://oauth2.googleapis.com/token",
    gcpProjectId: null,
    gcpRegion: null,
    host: "127.0.0.1",
    nodeEnv: "test",
    port: 3001,
    redisUrl: null,
  } satisfies WorkerEnv);
}

export class CliConfig extends Context.Tag("@mailmon/config/CliConfig")<CliConfig, CliEnv>() {
  static readonly layer = Layer.effect(
    this,
    Effect.all({
      asyncTransportMode: loadAsyncTransportMode,
      databaseUrl: Config.option(loadDatabaseUrl),
      nodeEnv: loadNodeEnv,
      workerBaseUrl: loadMailboxWorkerBaseUrl,
    }).pipe(
      Effect.map((config) => ({
        asyncTransportMode: config.asyncTransportMode,
        databaseUrl: normalizeOptional(config.databaseUrl),
        nodeEnv: config.nodeEnv,
        workerBaseUrl: config.workerBaseUrl,
      })),
    ),
  );

  static readonly testLayer = Layer.succeed(this, {
    asyncTransportMode: "local",
    databaseUrl: null,
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
