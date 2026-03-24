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
  readonly port: number;
}

export interface WorkerEnv extends CommonEnv {
  readonly asyncTransportMode: AsyncTransportMode;
  readonly databaseUrl: string;
  readonly gcpProjectId: string | null;
  readonly gcpRegion: string | null;
  readonly host: string;
  readonly port: number;
  readonly redisUrl: string | null;
}

export interface CliEnv extends CommonEnv {
  readonly asyncTransportMode: AsyncTransportMode;
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
      nodeEnv: loadNodeEnv,
      port: loadPort(3000),
    }),
  );

  static readonly testLayer = Layer.succeed(this, {
    databaseUrl: "postgres://mailmon:mailmon@localhost:5432/mailmon",
    nodeEnv: "test",
    port: 3000,
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
      nodeEnv: loadNodeEnv,
    }),
  );

  static readonly testLayer = Layer.succeed(this, {
    asyncTransportMode: "local",
    nodeEnv: "test",
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
