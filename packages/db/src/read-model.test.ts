import { randomUUID } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";

import { describe, expect, it } from "@effect/vitest";
import {
  getMessageOrFail,
  getThreadOrFail,
  listMailboxMessages,
  listMailboxThreads,
} from "@mailmon/core";
import { Effect } from "effect";
import postgres from "postgres";

import { createCorePersistenceLayer, createDb, schema } from "./index.js";

const DEFAULT_DATABASE_URL =
  process.env.DATABASE_URL ?? "postgres://mailmon:mailmon@localhost:5432/mailmon";
const primaryWorkspaceId = "ws_primary";
const foreignWorkspaceId = "ws_foreign";
const primaryMailboxId = "mbx_primary";
const foreignMailboxId = "mbx_foreign";
const migrationDirectory = new URL("../drizzle/", import.meta.url);

interface IsolatedDatabase {
  readonly adminConnectionString: string;
  readonly connectionString: string;
  readonly databaseName: string;
}

const withDatabaseName = (connectionString: string, databaseName: string) => {
  const url = new URL(connectionString);
  url.pathname = `/${databaseName}`;

  return url.toString();
};

const toAdminConnectionString = (connectionString: string) => {
  return withDatabaseName(connectionString, "postgres");
};

const createDatabaseName = () => {
  return `mailmon_test_${randomUUID().replaceAll("-", "")}`;
};

const readMigrationStatements = async () => {
  const entries = await readdir(migrationDirectory);
  // oxlint-disable-next-line unicorn/no-array-sort
  const migrationFiles = entries
    .filter((entry) => entry.endsWith(".sql"))
    .toSorted((left, right) => left.localeCompare(right));

  const statements = await Promise.all(
    migrationFiles.map(async (migrationFile: string) => {
      const sqlText = await readFile(
        new URL(`../drizzle/${migrationFile}`, import.meta.url),
        "utf8",
      );

      return sqlText
        .split("--> statement-breakpoint")
        .map((statement) => statement.trim())
        .filter((statement) => statement.length > 0);
    }),
  );

  return statements.flat();
};

const applyMigrations = async (connectionString: string) => {
  const client = postgres(connectionString, { max: 1 });

  try {
    for (const statement of await readMigrationStatements()) {
      await client.unsafe(statement);
    }
  } finally {
    await client.end();
  }
};

const createIsolatedDatabase = async (): Promise<IsolatedDatabase> => {
  const databaseName = createDatabaseName();
  const adminConnectionString = toAdminConnectionString(DEFAULT_DATABASE_URL);
  const connectionString = withDatabaseName(DEFAULT_DATABASE_URL, databaseName);
  const adminClient = postgres(adminConnectionString, { max: 1 });

  try {
    await adminClient.unsafe(`CREATE DATABASE "${databaseName}"`);
  } finally {
    await adminClient.end();
  }

  await applyMigrations(connectionString);

  return {
    adminConnectionString,
    connectionString,
    databaseName,
  };
};

const dropIsolatedDatabase = async (database: IsolatedDatabase) => {
  const adminClient = postgres(database.adminConnectionString, { max: 1 });

  try {
    await adminClient.unsafe(`
      SELECT pg_terminate_backend(pid)
      FROM pg_stat_activity
      WHERE datname = '${database.databaseName}'
        AND pid <> pg_backend_pid()
    `);
    await adminClient.unsafe(`DROP DATABASE IF EXISTS "${database.databaseName}"`);
  } finally {
    await adminClient.end();
  }
};

const withIsolatedDatabase = <A, E>(run: (database: IsolatedDatabase) => Effect.Effect<A, E>) =>
  Effect.acquireUseRelease(
    Effect.promise(() => createIsolatedDatabase()),
    run,
    (database) => Effect.promise(() => dropIsolatedDatabase(database)),
  );

const seedReadModelFixtures = async (connectionString: string) => {
  const database = createDb(connectionString);

  try {
    await database.db.insert(schema.workspaces).values([
      {
        id: primaryWorkspaceId,
      },
      {
        id: foreignWorkspaceId,
      },
    ]);

    await database.db.insert(schema.mailboxes).values([
      {
        id: primaryMailboxId,
        workspaceId: primaryWorkspaceId,
        provider: "gmail",
        emailAddress: "primary@mailmon.dev",
        status: "active",
        syncState: "healthy",
        watchState: "active",
      },
      {
        id: foreignMailboxId,
        workspaceId: foreignWorkspaceId,
        provider: "gmail",
        emailAddress: "foreign@mailmon.dev",
        status: "active",
        syncState: "healthy",
        watchState: "active",
      },
    ]);

    await database.db.insert(schema.threads).values([
      {
        id: "thr_400",
        mailboxId: primaryMailboxId,
        providerThreadId: "gmail_thr_400",
        subject: "Primary newest thread",
        lastMessageAt: new Date("2026-04-04T12:00:00.000Z"),
      },
      {
        id: "thr_300",
        mailboxId: primaryMailboxId,
        providerThreadId: "gmail_thr_300",
        subject: "Primary same-timestamp thread high id",
        lastMessageAt: new Date("2026-04-03T12:00:00.000Z"),
      },
      {
        id: "thr_250",
        mailboxId: primaryMailboxId,
        providerThreadId: "gmail_thr_250",
        subject: "Primary same-timestamp thread low id",
        lastMessageAt: new Date("2026-04-03T12:00:00.000Z"),
      },
      {
        id: "thr_100",
        mailboxId: primaryMailboxId,
        providerThreadId: "gmail_thr_100",
        subject: "Primary oldest thread",
        lastMessageAt: new Date("2026-04-01T12:00:00.000Z"),
      },
      {
        id: "thr_foreign",
        mailboxId: foreignMailboxId,
        providerThreadId: "gmail_thr_foreign",
        subject: "Foreign workspace thread",
        lastMessageAt: new Date("2026-04-05T12:00:00.000Z"),
      },
    ]);

    await database.db.insert(schema.messages).values([
      {
        id: "msg_400",
        mailboxId: primaryMailboxId,
        threadId: "thr_400",
        providerMessageId: "gmail_msg_400",
        providerThreadId: "gmail_thr_400",
        subject: "Primary newest message",
        fromName: "Alex",
        fromEmail: "alex@example.com",
        snippet: "Newest primary mailbox message",
        receivedAt: new Date("2026-04-04T10:00:00.000Z"),
        labelIds: ["INBOX"],
      },
      {
        id: "msg_300",
        mailboxId: primaryMailboxId,
        threadId: "thr_300",
        providerMessageId: "gmail_msg_300",
        providerThreadId: "gmail_thr_300",
        subject: "Primary same-timestamp message high id",
        fromName: "Blake",
        fromEmail: "blake@example.com",
        snippet: "High id message on same timestamp",
        receivedAt: new Date("2026-04-03T10:00:00.000Z"),
        labelIds: ["INBOX", "UNREAD"],
      },
      {
        id: "msg_250",
        mailboxId: primaryMailboxId,
        threadId: "thr_250",
        providerMessageId: "gmail_msg_250",
        providerThreadId: "gmail_thr_250",
        subject: "Primary same-timestamp message low id",
        fromName: "Casey",
        fromEmail: "casey@example.com",
        snippet: "Low id message on same timestamp",
        receivedAt: new Date("2026-04-03T10:00:00.000Z"),
        labelIds: ["INBOX"],
      },
      {
        id: "msg_100",
        mailboxId: primaryMailboxId,
        threadId: "thr_100",
        providerMessageId: "gmail_msg_100",
        providerThreadId: "gmail_thr_100",
        subject: "Primary oldest message",
        fromName: "Devon",
        fromEmail: "devon@example.com",
        snippet: "Oldest primary mailbox message",
        receivedAt: new Date("2026-04-01T10:00:00.000Z"),
        labelIds: ["INBOX"],
      },
      {
        id: "msg_foreign",
        mailboxId: foreignMailboxId,
        threadId: "thr_foreign",
        providerMessageId: "gmail_msg_foreign",
        providerThreadId: "gmail_thr_foreign",
        subject: "Foreign workspace message",
        fromName: "Erin",
        fromEmail: "erin@example.com",
        snippet: "Foreign mailbox message",
        receivedAt: new Date("2026-04-05T10:00:00.000Z"),
        labelIds: ["INBOX"],
      },
    ]);
  } finally {
    await database.client.end();
  }
};

const listReadIndexes = async (connectionString: string) => {
  const client = postgres(connectionString, { max: 1 });

  try {
    return await client<{ indexdef: string; indexname: string }[]>`
      SELECT indexname, indexdef
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND tablename IN ('messages', 'threads')
      ORDER BY indexname
    `;
  } finally {
    await client.end();
  }
};

describe("DB-backed mailbox read hardening", () => {
  it.effect("creates mailbox newest-first indexes in the migrated schema", () =>
    withIsolatedDatabase(({ connectionString }) =>
      Effect.gen(function* () {
        const indexes = yield* Effect.promise(() => listReadIndexes(connectionString));
        const messageIndex = indexes.find(
          (index) => index.indexname === "messages_mailbox_received_at_id_idx",
        );
        const threadIndex = indexes.find(
          (index) => index.indexname === "threads_mailbox_last_message_at_id_idx",
        );

        expect(messageIndex?.indexdef).toContain(
          "(mailbox_id, received_at DESC NULLS LAST, id DESC NULLS LAST)",
        );
        expect(threadIndex?.indexdef).toContain(
          "(mailbox_id, last_message_at DESC NULLS LAST, id DESC NULLS LAST)",
        );
      }),
    ),
  );

  it.effect("paginates mailbox messages newest-first with opaque cursors", () =>
    withIsolatedDatabase(({ connectionString }) => {
      const persistenceLayer = createCorePersistenceLayer(connectionString);

      return Effect.gen(function* () {
        yield* Effect.promise(() => seedReadModelFixtures(connectionString));

        const firstPage = yield* listMailboxMessages(primaryMailboxId, {
          limit: 2,
          workspaceId: primaryWorkspaceId,
        });
        const firstCursor = firstPage.nextCursor;

        expect(firstPage.data.map((message) => message.id)).toEqual(["msg_400", "msg_300"]);
        expect(firstCursor).toMatch(/^cur_/);
        expect(firstCursor).not.toBe("msg_300");

        if (firstCursor === null) {
          throw new Error("Expected a second page cursor for mailbox messages.");
        }

        const secondPage = yield* listMailboxMessages(primaryMailboxId, {
          cursor: firstCursor,
          limit: 2,
          workspaceId: primaryWorkspaceId,
        });

        expect(secondPage.data.map((message) => message.id)).toEqual(["msg_250", "msg_100"]);
        expect(secondPage.nextCursor).toBeNull();
      }).pipe(Effect.provide(persistenceLayer));
    }),
  );

  it.effect("paginates mailbox threads newest-first with opaque cursors", () =>
    withIsolatedDatabase(({ connectionString }) => {
      const persistenceLayer = createCorePersistenceLayer(connectionString);

      return Effect.gen(function* () {
        yield* Effect.promise(() => seedReadModelFixtures(connectionString));

        const firstPage = yield* listMailboxThreads(primaryMailboxId, {
          limit: 2,
          workspaceId: primaryWorkspaceId,
        });
        const firstCursor = firstPage.nextCursor;

        expect(firstPage.data.map((thread) => thread.id)).toEqual(["thr_400", "thr_300"]);
        expect(firstCursor).toMatch(/^cur_/);
        expect(firstCursor).not.toBe("thr_300");

        if (firstCursor === null) {
          throw new Error("Expected a second page cursor for mailbox threads.");
        }

        const secondPage = yield* listMailboxThreads(primaryMailboxId, {
          cursor: firstCursor,
          limit: 2,
          workspaceId: primaryWorkspaceId,
        });

        expect(secondPage.data.map((thread) => thread.id)).toEqual(["thr_250", "thr_100"]);
        expect(secondPage.nextCursor).toBeNull();
      }).pipe(Effect.provide(persistenceLayer));
    }),
  );

  it.effect("enforces workspace ownership for mailbox message reads", () =>
    withIsolatedDatabase(({ connectionString }) => {
      const persistenceLayer = createCorePersistenceLayer(connectionString);

      return Effect.gen(function* () {
        yield* Effect.promise(() => seedReadModelFixtures(connectionString));

        const message = yield* getMessageOrFail("msg_400", {
          workspaceId: primaryWorkspaceId,
        });
        const listProblem = yield* listMailboxMessages(primaryMailboxId, {
          limit: 10,
          workspaceId: foreignWorkspaceId,
        }).pipe(Effect.flip);
        const messageProblem = yield* getMessageOrFail("msg_400", {
          workspaceId: foreignWorkspaceId,
        }).pipe(Effect.flip);

        expect(message.id).toBe("msg_400");
        expect(listProblem.code).toBe("mailbox_not_found");
        expect(messageProblem.code).toBe("message_not_found");
      }).pipe(Effect.provide(persistenceLayer));
    }),
  );

  it.effect("enforces workspace ownership for mailbox thread reads", () =>
    withIsolatedDatabase(({ connectionString }) => {
      const persistenceLayer = createCorePersistenceLayer(connectionString);

      return Effect.gen(function* () {
        yield* Effect.promise(() => seedReadModelFixtures(connectionString));

        const thread = yield* getThreadOrFail("thr_400", {
          workspaceId: primaryWorkspaceId,
        });
        const listProblem = yield* listMailboxThreads(primaryMailboxId, {
          limit: 10,
          workspaceId: foreignWorkspaceId,
        }).pipe(Effect.flip);
        const threadProblem = yield* getThreadOrFail("thr_400", {
          workspaceId: foreignWorkspaceId,
        }).pipe(Effect.flip);

        expect(thread.messages).toEqual([
          {
            id: "msg_400",
            receivedAt: "2026-04-04T10:00:00.000Z",
            subject: "Primary newest message",
          },
        ]);
        expect(listProblem.code).toBe("mailbox_not_found");
        expect(threadProblem.code).toBe("thread_not_found");
      }).pipe(Effect.provide(persistenceLayer));
    }),
  );
});
