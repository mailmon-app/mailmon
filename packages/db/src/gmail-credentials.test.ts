import { randomUUID } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";

import { describe, expect, it } from "@effect/vitest";
import { MailboxConnectSessionStore, SyncRunStore } from "@mailmon/core";
import {
  createAesGcmGmailRefreshTokenCipherLayer,
  GmailMailboxCredentialStore,
} from "@mailmon/gmail";
import { eq } from "drizzle-orm";
import { Effect, Layer } from "effect";
import postgres from "postgres";

import { createDb, createWorkerPersistenceLayer, schema } from "./index.js";

const DEFAULT_DATABASE_URL =
  process.env.DATABASE_URL ?? "postgres://mailmon:mailmon@localhost:5432/mailmon";
const migrationDirectory = new URL("../drizzle/", import.meta.url);
const workspaceId = "ws_gmail_credentials";
const testGmailRefreshTokenCipherLayer = createAesGcmGmailRefreshTokenCipherLayer({
  allowPlaintextFallback: true,
  encryptionKey: "BwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwc=",
});

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
  const migrationFiles = entries.filter((entry) => entry.endsWith(".sql"));
  // oxlint-disable-next-line unicorn/no-array-sort
  migrationFiles.sort((left, right) => left.localeCompare(right));

  const statements = await Promise.all(
    migrationFiles.map(async (migrationFile) => {
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

const seedWorkspace = async (connectionString: string) => {
  const database = createDb(connectionString);

  try {
    await database.db.insert(schema.workspaces).values({
      id: workspaceId,
    });
  } finally {
    await database.client.end();
  }
};

describe("gmail mailbox credentials", () => {
  it.effect("encrypts refresh tokens at rest and decrypts them for worker reads", () =>
    withIsolatedDatabase((database) =>
      Effect.gen(function* () {
        yield* Effect.promise(() => seedWorkspace(database.connectionString));

        const persistenceLayer = createWorkerPersistenceLayer(database.connectionString).pipe(
          Layer.provide(testGmailRefreshTokenCipherLayer),
        );

        const completedConnectSession = yield* Effect.gen(function* () {
          const connectSessionStore = yield* MailboxConnectSessionStore;
          const credentialStore = yield* GmailMailboxCredentialStore;
          const connectedAt = "2026-04-13T08:30:00.000Z";

          const connectSession = yield* connectSessionStore.createConnectSession({
            id: "mcs_refresh_token",
            workspaceId,
            provider: "gmail",
            tenantExternalId: "tenant_refresh_token",
            mailboxExternalId: "mailbox_refresh_token",
            redirectUrl: "https://app.example.com/oauth/callback",
            codeVerifier: "code-verifier",
            expiresAt: "2026-04-13T09:30:00.000Z",
          });

          const completed = yield* connectSessionStore.completeConnectSession({
            connectSessionId: connectSession.id,
            connectedAt,
            providerAccountEmail: "demo@mailmon.dev",
            refreshToken: "refresh-token-plaintext",
          });

          const credential = yield* credentialStore.getGmailMailboxCredential(completed.mailbox.id);

          expect(credential).not.toBeNull();
          expect(credential?.refreshToken).toBe("refresh-token-plaintext");

          return completed;
        }).pipe(Effect.provide(persistenceLayer));

        const storedCredential = yield* Effect.promise(async () => {
          const verificationDatabase = createDb(database.connectionString);

          try {
            const [row] = await verificationDatabase.db
              .select({
                refreshTokenCiphertext: schema.gmailMailboxCredentials.refreshTokenCiphertext,
              })
              .from(schema.gmailMailboxCredentials)
              .where(eq(schema.gmailMailboxCredentials.mailboxId, completedConnectSession.mailbox.id))
              .limit(1);

            return row;
          } finally {
            await verificationDatabase.client.end();
          }
        });

        expect(storedCredential).toBeDefined();
        expect(storedCredential?.refreshTokenCiphertext).not.toBe("refresh-token-plaintext");
        expect(storedCredential?.refreshTokenCiphertext).toMatch(/^mmrt_v1:/);
      }),
    ),
  );

  it.effect("moves mailboxes into reconnect_required for terminal Gmail auth failures", () =>
    withIsolatedDatabase((database) =>
      Effect.gen(function* () {
        yield* Effect.promise(() => seedWorkspace(database.connectionString));

        const persistenceLayer = createWorkerPersistenceLayer(database.connectionString).pipe(
          Layer.provide(testGmailRefreshTokenCipherLayer),
        );

        const mailboxId = yield* Effect.gen(function* () {
          const connectSessionStore = yield* MailboxConnectSessionStore;
          const syncRunStore = yield* SyncRunStore;

          const connectSession = yield* connectSessionStore.createConnectSession({
            id: "mcs_reconnect_required",
            workspaceId,
            provider: "gmail",
            tenantExternalId: "tenant_reconnect_required",
            mailboxExternalId: "mailbox_reconnect_required",
            redirectUrl: "https://app.example.com/oauth/callback",
            codeVerifier: "code-verifier",
            expiresAt: "2026-04-13T09:30:00.000Z",
          });

          const completed = yield* connectSessionStore.completeConnectSession({
            connectSessionId: connectSession.id,
            connectedAt: "2026-04-13T08:30:00.000Z",
            providerAccountEmail: "demo@mailmon.dev",
            refreshToken: "refresh-token-plaintext",
          });
          const syncRun = yield* syncRunStore.startSyncRun(completed.mailbox.id);

          yield* syncRunStore.completeSyncRun({
            syncRunId: syncRun.syncRunId,
            mailboxId: completed.mailbox.id,
            completedAt: "2026-04-13T08:45:00.000Z",
            status: "reconnect_required",
            eventsEmitted: 0,
            nextCursor: null,
            detail: "gmail_token_refresh_reconnect_required",
          });

          return completed.mailbox.id;
        }).pipe(Effect.provide(persistenceLayer));

        const storedMailbox = yield* Effect.promise(async () => {
          const verificationDatabase = createDb(database.connectionString);

          try {
            const [row] = await verificationDatabase.db
              .select({
                lastErrorCode: schema.mailboxes.lastErrorCode,
                lastErrorRetryable: schema.mailboxes.lastErrorRetryable,
                status: schema.mailboxes.status,
                syncState: schema.mailboxes.syncState,
              })
              .from(schema.mailboxes)
              .where(eq(schema.mailboxes.id, mailboxId))
              .limit(1);

            return row;
          } finally {
            await verificationDatabase.client.end();
          }
        });

        expect(storedMailbox).toMatchObject({
          lastErrorCode: "gmail_token_refresh_reconnect_required",
          lastErrorRetryable: false,
          status: "reconnect_required",
          syncState: "failed",
        });
      }),
    ),
  );

  it.effect("moves mailboxes into reconnect_required when Gmail mailbox credentials are missing", () =>
    withIsolatedDatabase((database) =>
      Effect.gen(function* () {
        yield* Effect.promise(() => seedWorkspace(database.connectionString));

        const seededMailboxId = yield* Effect.promise(async () => {
          const seededDatabase = createDb(database.connectionString);

          try {
            await seededDatabase.db.insert(schema.mailboxes).values({
              id: "mbx_missing_credentials",
              workspaceId,
              provider: "gmail",
              tenantExternalId: "tenant_missing_credentials",
              mailboxExternalId: "mailbox_missing_credentials",
              emailAddress: "missing@mailmon.dev",
              status: "active",
              syncState: "healthy",
              watchState: "active",
              createdAt: new Date("2026-04-13T08:30:00.000Z"),
              updatedAt: new Date("2026-04-13T08:30:00.000Z"),
            });

            return "mbx_missing_credentials";
          } finally {
            await seededDatabase.client.end();
          }
        });

        const persistenceLayer = createWorkerPersistenceLayer(database.connectionString).pipe(
          Layer.provide(testGmailRefreshTokenCipherLayer),
        );

        yield* Effect.gen(function* () {
          const syncRunStore = yield* SyncRunStore;
          const syncRun = yield* syncRunStore.startSyncRun(seededMailboxId);

          yield* syncRunStore.completeSyncRun({
            syncRunId: syncRun.syncRunId,
            mailboxId: seededMailboxId,
            completedAt: "2026-04-13T08:45:00.000Z",
            status: "reconnect_required",
            eventsEmitted: 0,
            nextCursor: null,
            detail: "gmail_mailbox_credentials_missing",
          });
        }).pipe(Effect.provide(persistenceLayer));

        const storedMailbox = yield* Effect.promise(async () => {
          const verificationDatabase = createDb(database.connectionString);

          try {
            const [row] = await verificationDatabase.db
              .select({
                lastErrorCode: schema.mailboxes.lastErrorCode,
                lastErrorRetryable: schema.mailboxes.lastErrorRetryable,
                status: schema.mailboxes.status,
                syncState: schema.mailboxes.syncState,
              })
              .from(schema.mailboxes)
              .where(eq(schema.mailboxes.id, seededMailboxId))
              .limit(1);

            return row;
          } finally {
            await verificationDatabase.client.end();
          }
        });

        expect(storedMailbox).toMatchObject({
          lastErrorCode: "gmail_mailbox_credentials_missing",
          lastErrorRetryable: false,
          status: "reconnect_required",
          syncState: "failed",
        });
      }),
    ),
  );
});
