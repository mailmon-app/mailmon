export { MailboxSyncJobDataSchema, type MailboxSyncJobData } from "@mailmon/core";

export const SYNC_MAILBOX_QUEUE = "mailmon.sync-mailbox";

export const createMailboxSyncJobData = (mailboxId: string) => {
  return {
    mailboxId,
  };
};

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
