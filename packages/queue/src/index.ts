import { Schema } from "effect";

export const SYNC_ACCOUNT_QUEUE = "mailmon.sync-account";

export const SyncJobDataSchema = Schema.Struct({
  accountId: Schema.String,
});

export type SyncJobData = Schema.Schema.Type<typeof SyncJobDataSchema>;

export const createRedisConnectionOptions = (redisUrl: string) => {
  const url = new URL(redisUrl);
  const database = url.pathname === "" ? undefined : Number(url.pathname.slice(1));

  return {
    db: Number.isNaN(database) ? undefined : database,
    host: url.hostname,
    maxRetriesPerRequest: null,
    password: url.password === "" ? undefined : url.password,
    port: Number(url.port || "6379"),
  };
};
