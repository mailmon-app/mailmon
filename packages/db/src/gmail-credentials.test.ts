import { describe, expect, it } from "@effect/vitest";
import { MailboxConnectSessionStore, SyncRunStore } from "@mailmon/core";
import {
  createAesGcmGmailRefreshTokenCipherLayer,
  GmailMailboxCredentialStore,
  GmailRefreshTokenCipher,
} from "@mailmon/gmail";
import { eq } from "drizzle-orm";
import { Effect, Layer } from "effect";

import {
  auditGmailMailboxCredentials,
  createDb,
  createDatabaseLayer,
  createWorkerPersistenceLayer,
  rewrapGmailMailboxCredentials,
  schema,
} from "./index.js";
import { withIsolatedDatabaseEffect } from "./test-setup.js";

const workspaceId = "ws_gmail_credentials";
const testGmailRefreshTokenCipherLayer = createAesGcmGmailRefreshTokenCipherLayer({
  allowPlaintextFallback: true,
  encryptionKey: "BwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwc=",
});
const rotatedGmailRefreshTokenCipherLayer = createAesGcmGmailRefreshTokenCipherLayer({
  activeKeyId: "key_new",
  decryptionKeys: [
    {
      encryptionKey: "BwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwc=",
      keyId: "key_old",
    },
  ],
  encryptionKey: "CAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAg=",
});

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

const createEncryptedRefreshToken = (refreshToken: string) =>
  Effect.gen(function* () {
    const cipher = yield* GmailRefreshTokenCipher;

    return yield* cipher.encryptRefreshToken(refreshToken);
  });

describe("gmail mailbox credentials", () => {
  it.effect("encrypts refresh tokens at rest and decrypts them for worker reads", () =>
    withIsolatedDatabaseEffect((database) =>
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

          expect(completed.mailbox.watchState).toBe("expired");

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
              .where(
                eq(schema.gmailMailboxCredentials.mailboxId, completedConnectSession.mailbox.id),
              )
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

  it.effect(
    "reconnects an existing Gmail mailbox by rotating credentials and clearing errors",
    () =>
      withIsolatedDatabaseEffect((database) =>
        Effect.gen(function* () {
          yield* Effect.promise(() => seedWorkspace(database.connectionString));

          const oldEncryptedRefreshToken = yield* createEncryptedRefreshToken(
            "old-refresh-token",
          ).pipe(Effect.provide(testGmailRefreshTokenCipherLayer));

          yield* Effect.promise(async () => {
            const seededDatabase = createDb(database.connectionString);
            const createdAt = new Date("2026-04-13T08:30:00.000Z");
            const failedAt = new Date("2026-04-13T08:45:00.000Z");

            try {
              await seededDatabase.db.insert(schema.mailboxes).values({
                id: "mbx_reconnect_existing",
                workspaceId,
                provider: "gmail",
                tenantExternalId: "tenant_old",
                mailboxExternalId: "mailbox_old",
                emailAddress: "demo@mailmon.dev",
                status: "reconnect_required",
                syncState: "failed",
                watchState: "active",
                lastErrorCode: "gmail_token_refresh_reconnect_required",
                lastErrorMessage:
                  "Refreshing the Gmail access token failed because the stored Gmail refresh token is invalid or revoked. The mailbox must be reconnected.",
                lastErrorOccurredAt: failedAt,
                lastErrorRetryable: false,
                createdAt,
                updatedAt: failedAt,
              });
              await seededDatabase.db.insert(schema.gmailMailboxCredentials).values({
                mailboxId: "mbx_reconnect_existing",
                refreshTokenCiphertext: oldEncryptedRefreshToken,
                createdAt,
                updatedAt: failedAt,
              });
            } finally {
              await seededDatabase.client.end();
            }
          });

          const persistenceLayer = createWorkerPersistenceLayer(database.connectionString).pipe(
            Layer.provide(testGmailRefreshTokenCipherLayer),
          );

          const completed = yield* Effect.gen(function* () {
            const connectSessionStore = yield* MailboxConnectSessionStore;
            const credentialStore = yield* GmailMailboxCredentialStore;

            const connectSession = yield* connectSessionStore.createConnectSession({
              id: "mcs_reconnect_existing",
              workspaceId,
              provider: "gmail",
              tenantExternalId: "tenant_new",
              mailboxExternalId: "mailbox_new",
              redirectUrl: "https://app.example.com/oauth/callback",
              codeVerifier: "code-verifier",
              expiresAt: "2026-04-13T09:30:00.000Z",
            });

            const reconnected = yield* connectSessionStore.completeConnectSession({
              connectSessionId: connectSession.id,
              connectedAt: "2026-04-13T08:50:00.000Z",
              providerAccountEmail: "DEMO@mailmon.dev",
              refreshToken: "new-refresh-token",
            });
            const credential = yield* credentialStore.getGmailMailboxCredential(
              reconnected.mailbox.id,
            );

            return {
              credential,
              reconnected,
            };
          }).pipe(Effect.provide(persistenceLayer));

          expect(completed.reconnected.created).toBe(false);
          expect(completed.reconnected.mailbox).toMatchObject({
            id: "mbx_reconnect_existing",
            status: "active",
            syncState: "initializing",
            watchState: "expired",
            lastError: null,
          });
          expect(completed.credential?.refreshToken).toBe("new-refresh-token");

          const storedRows = yield* Effect.promise(async () => {
            const verificationDatabase = createDb(database.connectionString);

            try {
              const [connectSession] = await verificationDatabase.db
                .select({
                  completedAt: schema.mailboxConnectSessions.completedAt,
                  mailboxId: schema.mailboxConnectSessions.mailboxId,
                })
                .from(schema.mailboxConnectSessions)
                .where(eq(schema.mailboxConnectSessions.id, "mcs_reconnect_existing"))
                .limit(1);
              const [credential] = await verificationDatabase.db
                .select({
                  refreshTokenCiphertext: schema.gmailMailboxCredentials.refreshTokenCiphertext,
                })
                .from(schema.gmailMailboxCredentials)
                .where(eq(schema.gmailMailboxCredentials.mailboxId, "mbx_reconnect_existing"))
                .limit(1);

              return {
                connectSession,
                credential,
              };
            } finally {
              await verificationDatabase.client.end();
            }
          });

          expect(storedRows.connectSession?.mailboxId).toBe("mbx_reconnect_existing");
          expect(storedRows.connectSession?.completedAt?.toISOString()).toBe(
            "2026-04-13T08:50:00.000Z",
          );
          expect(storedRows.credential?.refreshTokenCiphertext).toMatch(/^mmrt_v1:/);
          expect(storedRows.credential?.refreshTokenCiphertext).not.toBe(oldEncryptedRefreshToken);
        }),
      ),
  );

  it.effect("audits and rewraps plaintext and previous-key Gmail credentials", () =>
    withIsolatedDatabaseEffect((database) =>
      Effect.gen(function* () {
        yield* Effect.promise(() => seedWorkspace(database.connectionString));

        const currentEncryptedRefreshToken = yield* createEncryptedRefreshToken(
          "current-refresh-token",
        ).pipe(Effect.provide(rotatedGmailRefreshTokenCipherLayer));
        const oldEncryptedRefreshToken = yield* createEncryptedRefreshToken(
          "old-refresh-token",
        ).pipe(
          Effect.provide(
            createAesGcmGmailRefreshTokenCipherLayer({
              activeKeyId: "key_old",
              encryptionKey: "BwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwc=",
            }),
          ),
        );

        yield* Effect.promise(async () => {
          const seededDatabase = createDb(database.connectionString);
          const createdAt = new Date("2026-04-13T08:30:00.000Z");

          try {
            await seededDatabase.db.insert(schema.mailboxes).values([
              {
                id: "mbx_credential_current",
                workspaceId,
                provider: "gmail",
                tenantExternalId: "tenant_current",
                mailboxExternalId: "mailbox_current",
                emailAddress: "current@mailmon.dev",
                status: "active",
                syncState: "healthy",
                watchState: "active",
                createdAt,
                updatedAt: createdAt,
              },
              {
                id: "mbx_credential_old",
                workspaceId,
                provider: "gmail",
                tenantExternalId: "tenant_old",
                mailboxExternalId: "mailbox_old",
                emailAddress: "old@mailmon.dev",
                status: "active",
                syncState: "healthy",
                watchState: "active",
                createdAt,
                updatedAt: createdAt,
              },
              {
                id: "mbx_credential_plaintext",
                workspaceId,
                provider: "gmail",
                tenantExternalId: "tenant_plaintext",
                mailboxExternalId: "mailbox_plaintext",
                emailAddress: "plaintext@mailmon.dev",
                status: "active",
                syncState: "healthy",
                watchState: "active",
                createdAt,
                updatedAt: createdAt,
              },
              {
                id: "mbx_credential_unreadable",
                workspaceId,
                provider: "gmail",
                tenantExternalId: "tenant_unreadable",
                mailboxExternalId: "mailbox_unreadable",
                emailAddress: "unreadable@mailmon.dev",
                status: "active",
                syncState: "healthy",
                watchState: "active",
                createdAt,
                updatedAt: createdAt,
              },
            ]);
            await seededDatabase.db.insert(schema.gmailMailboxCredentials).values([
              {
                mailboxId: "mbx_credential_current",
                refreshTokenCiphertext: currentEncryptedRefreshToken,
                createdAt,
                updatedAt: createdAt,
              },
              {
                mailboxId: "mbx_credential_old",
                refreshTokenCiphertext: oldEncryptedRefreshToken,
                createdAt,
                updatedAt: createdAt,
              },
              {
                mailboxId: "mbx_credential_plaintext",
                refreshTokenCiphertext: "plaintext-refresh-token",
                createdAt,
                updatedAt: createdAt,
              },
              {
                mailboxId: "mbx_credential_unreadable",
                refreshTokenCiphertext: "mmrt_v1:not-json",
                createdAt,
                updatedAt: createdAt,
              },
            ]);
          } finally {
            await seededDatabase.client.end();
          }
        });

        const operatorLayer = Layer.mergeAll(
          createDatabaseLayer(database.connectionString),
          rotatedGmailRefreshTokenCipherLayer,
        );
        const credentialOperationResult = yield* Effect.gen(function* () {
          const initialAuditReport = yield* auditGmailMailboxCredentials();
          const migrationResult = yield* rewrapGmailMailboxCredentials({
            markUnreadableReconnectRequired: true,
            observedAt: "2026-04-13T08:45:00.000Z",
          });

          return {
            auditReport: initialAuditReport,
            rewrapResult: migrationResult,
          };
        }).pipe(Effect.provide(operatorLayer));
        const verification = yield* Effect.promise(async () => {
          const verificationDatabase = createDb(database.connectionString);

          try {
            const credentials = await verificationDatabase.db
              .select({
                mailboxId: schema.gmailMailboxCredentials.mailboxId,
                refreshTokenCiphertext: schema.gmailMailboxCredentials.refreshTokenCiphertext,
              })
              .from(schema.gmailMailboxCredentials);
            const [unreadableMailbox] = await verificationDatabase.db
              .select({
                lastErrorCode: schema.mailboxes.lastErrorCode,
                status: schema.mailboxes.status,
                syncState: schema.mailboxes.syncState,
              })
              .from(schema.mailboxes)
              .where(eq(schema.mailboxes.id, "mbx_credential_unreadable"))
              .limit(1);

            return {
              credentials,
              unreadableMailbox,
            };
          } finally {
            await verificationDatabase.client.end();
          }
        });

        expect(credentialOperationResult.auditReport).toMatchObject({
          encryptedCurrent: 1,
          encryptedRewrapRequired: 1,
          plaintext: 1,
          total: 4,
          unreadable: 1,
        });
        const auditStatuses = credentialOperationResult.auditReport.items.map(
          (item) => [item.mailboxId, item.status] as const,
        );

        // oxlint-disable-next-line unicorn/no-array-sort
        auditStatuses.sort((left, right) => left[0].localeCompare(right[0]));

        expect(auditStatuses).toEqual([
          ["mbx_credential_current", "encrypted_current"],
          ["mbx_credential_old", "encrypted_rewrap_required"],
          ["mbx_credential_plaintext", "plaintext"],
          ["mbx_credential_unreadable", "unreadable"],
        ]);
        expect(credentialOperationResult.rewrapResult).toEqual({
          alreadyCurrent: 1,
          markedReconnectRequired: 1,
          rewrapped: 2,
          staleSkipped: 0,
          total: 4,
          unreadable: 0,
        });
        expect(verification.unreadableMailbox).toMatchObject({
          lastErrorCode: "gmail_mailbox_credential_unreadable",
          status: "reconnect_required",
          syncState: "failed",
        });
        expect(
          verification.credentials.filter(
            (credential) =>
              credential.mailboxId !== "mbx_credential_unreadable" &&
              credential.refreshTokenCiphertext.startsWith("mmrt_v1:"),
          ),
        ).toHaveLength(3);
      }),
    ),
  );

  it.effect("moves mailboxes into reconnect_required for terminal Gmail auth failures", () =>
    withIsolatedDatabaseEffect((database) =>
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

  it.effect(
    "moves mailboxes into reconnect_required when Gmail mailbox credentials are missing",
    () =>
      withIsolatedDatabaseEffect((database) =>
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
