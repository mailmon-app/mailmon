import { Config, Context, Effect, Layer } from "effect";

const nonEmptyString = (name: string) =>
  Config.string(name).pipe(
    Config.validate({
      message: `${name} must be a non-empty string`,
      validation: (value) => value.length > 0,
    }),
  );

export type NodeEnv = "development" | "test" | "production";

const loadNodeEnv: Config.Config<NodeEnv> = Config.literal(
  "development",
  "test",
  "production",
)("NODE_ENV").pipe(Config.orElse(() => Config.succeed("development" as const)));

const loadRedisUrl = nonEmptyString("REDIS_URL");
const loadDatabaseUrl = nonEmptyString("DATABASE_URL");
const loadPort = Config.port("PORT").pipe(Config.orElse(() => Config.succeed(3000)));

const loadCommonConfig = Effect.all({
  nodeEnv: loadNodeEnv,
  redisUrl: loadRedisUrl,
});

export interface CommonEnv {
  readonly nodeEnv: NodeEnv;
  readonly redisUrl: string;
}

export interface ApiEnv extends CommonEnv {
  readonly databaseUrl: string;
  readonly port: number;
}

export interface WorkerEnv extends CommonEnv {
  readonly databaseUrl: string;
}

export interface CliEnv extends CommonEnv {}

export class CommonConfig extends Context.Tag("@mailmon/config/CommonConfig")<
  CommonConfig,
  CommonEnv
>() {
  static readonly layer = Layer.effect(this, loadCommonConfig);

  static readonly testLayer = Layer.succeed(this, {
    nodeEnv: "test",
    redisUrl: "redis://localhost:6379",
  } satisfies CommonEnv);
}

export class ApiConfig extends Context.Tag("@mailmon/config/ApiConfig")<ApiConfig, ApiEnv>() {
  static readonly layer = Layer.effect(
    this,
    Effect.all({
      databaseUrl: loadDatabaseUrl,
      nodeEnv: loadNodeEnv,
      port: loadPort,
      redisUrl: loadRedisUrl,
    }),
  );

  static readonly testLayer = Layer.succeed(this, {
    databaseUrl: "postgres://mailmon:mailmon@localhost:5432/mailmon",
    nodeEnv: "test",
    port: 3000,
    redisUrl: "redis://localhost:6379",
  } satisfies ApiEnv);
}

export class WorkerConfig extends Context.Tag("@mailmon/config/WorkerConfig")<
  WorkerConfig,
  WorkerEnv
>() {
  static readonly layer = Layer.effect(
    this,
    Effect.all({
      databaseUrl: loadDatabaseUrl,
      nodeEnv: loadNodeEnv,
      redisUrl: loadRedisUrl,
    }),
  );

  static readonly testLayer = Layer.succeed(this, {
    databaseUrl: "postgres://mailmon:mailmon@localhost:5432/mailmon",
    nodeEnv: "test",
    redisUrl: "redis://localhost:6379",
  } satisfies WorkerEnv);
}

export class CliConfig extends Context.Tag("@mailmon/config/CliConfig")<CliConfig, CliEnv>() {
  static readonly layer = Layer.effect(this, loadCommonConfig);

  static readonly testLayer = Layer.succeed(this, {
    nodeEnv: "test",
    redisUrl: "redis://localhost:6379",
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
