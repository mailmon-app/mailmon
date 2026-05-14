import { MailboxConnectSessionStore, type CompletedMailboxConnectSession } from "@mailmon/core";
import { GmailRefreshTokenCipher } from "@mailmon/gmail";
import { and, eq, or } from "drizzle-orm";
import { Effect, Layer, Option } from "effect";

import { gmailMailboxCredentials, mailboxConnectSessions, mailboxes } from "../schema.js";
import { createMailboxId, normalizeEmailAddress, toDate } from "./common-mappers.js";
import { MailmonDatabase } from "./database.js";
import { gmailMailboxCredentialEncryptionFailed, isProblemDetails } from "./problems.js";
import { toMailboxResource, toStoredConnectSession } from "./public-resource-mappers.js";

export const createMailboxConnectSessionStoreLayer = Layer.effect(
  MailboxConnectSessionStore,
  Effect.gen(function* () {
    const database = yield* MailmonDatabase;
    const gmailRefreshTokenCipher = yield* GmailRefreshTokenCipher;

    return {
      createConnectSession: (params) =>
        Effect.promise(async () => {
          const [row] = await database.db
            .insert(mailboxConnectSessions)
            .values({
              id: params.id,
              provider: params.provider,
              workspaceId: params.workspaceId,
              tenantExternalId: params.tenantExternalId,
              mailboxExternalId: params.mailboxExternalId,
              redirectUrl: params.redirectUrl,
              codeVerifier: params.codeVerifier,
              expiresAt: toDate(params.expiresAt),
            })
            .returning();

          if (row === undefined) {
            throw new Error(`Connect session ${params.id} was not created.`);
          }

          return toStoredConnectSession(row);
        }),
      getConnectSession: (connectSessionId: string) =>
        Effect.promise(async () => {
          const [row] = await database.db
            .select()
            .from(mailboxConnectSessions)
            .where(eq(mailboxConnectSessions.id, connectSessionId))
            .limit(1);

          return Option.fromNullishOr(row).pipe(Option.map(toStoredConnectSession));
        }),
      completeConnectSession: (params) =>
        Effect.gen(function* () {
          const encryptedRefreshToken = yield* gmailRefreshTokenCipher
            .encryptRefreshToken(params.refreshToken)
            .pipe(
              Effect.mapError(() =>
                gmailMailboxCredentialEncryptionFailed(params.connectSessionId),
              ),
            );

          return yield* Effect.tryPromise({
            catch: (error) => {
              if (isProblemDetails(error)) {
                return error;
              }

              throw error;
            },
            try: async () => {
              return database.db.transaction(async (transaction) => {
                const [connectSession] = await transaction
                  .select()
                  .from(mailboxConnectSessions)
                  .where(eq(mailboxConnectSessions.id, params.connectSessionId))
                  .limit(1);

                if (connectSession === undefined) {
                  throw new Error(`Connect session ${params.connectSessionId} does not exist.`);
                }

                if (connectSession.mailboxId !== null) {
                  const [existingMailbox] = await transaction
                    .select()
                    .from(mailboxes)
                    .where(eq(mailboxes.id, connectSession.mailboxId))
                    .limit(1);

                  if (existingMailbox === undefined) {
                    throw new Error(
                      `Mailbox ${connectSession.mailboxId} referenced by connect session ${connectSession.id} does not exist.`,
                    );
                  }

                  return {
                    mailbox: toMailboxResource(existingMailbox),
                    redirectUrl: connectSession.redirectUrl,
                    created: false,
                  } satisfies CompletedMailboxConnectSession;
                }

                const normalizedEmailAddress = normalizeEmailAddress(params.providerAccountEmail);
                const [existingMailbox] = await transaction
                  .select()
                  .from(mailboxes)
                  .where(
                    and(
                      eq(mailboxes.workspaceId, connectSession.workspaceId),
                      eq(mailboxes.provider, connectSession.provider),
                      or(
                        eq(mailboxes.emailAddress, normalizedEmailAddress),
                        and(
                          eq(mailboxes.tenantExternalId, connectSession.tenantExternalId),
                          eq(mailboxes.mailboxExternalId, connectSession.mailboxExternalId),
                        ),
                      ),
                    ),
                  )
                  .limit(1);

                const createdAt = toDate(params.connectedAt);

                if (existingMailbox !== undefined) {
                  const [updatedMailbox] = await transaction
                    .update(mailboxes)
                    .set({
                      activeSyncLeaseAcquiredAt: null,
                      activeSyncLeaseExpiresAt: null,
                      activeSyncLeaseHeartbeatAt: null,
                      activeSyncLeaseOwner: null,
                      activeSyncRunId: null,
                      emailAddress: normalizedEmailAddress,
                      lastErrorCode: null,
                      lastErrorMessage: null,
                      lastErrorOccurredAt: null,
                      lastErrorRetryable: null,
                      mailboxExternalId: connectSession.mailboxExternalId,
                      status: "active",
                      syncState: "initializing",
                      tenantExternalId: connectSession.tenantExternalId,
                      updatedAt: createdAt,
                      watchExpirationAt: null,
                      watchLastRenewedAt: null,
                      watchState: "expired",
                    })
                    .where(eq(mailboxes.id, existingMailbox.id))
                    .returning();

                  if (updatedMailbox === undefined) {
                    throw new Error(`Mailbox ${existingMailbox.id} was not updated.`);
                  }

                  const [updatedCredential] = await transaction
                    .update(gmailMailboxCredentials)
                    .set({
                      refreshTokenCiphertext: encryptedRefreshToken,
                      updatedAt: createdAt,
                    })
                    .where(eq(gmailMailboxCredentials.mailboxId, existingMailbox.id))
                    .returning();

                  if (updatedCredential === undefined) {
                    await transaction.insert(gmailMailboxCredentials).values({
                      mailboxId: existingMailbox.id,
                      refreshTokenCiphertext: encryptedRefreshToken,
                      createdAt,
                      updatedAt: createdAt,
                    });
                  }

                  await transaction
                    .update(mailboxConnectSessions)
                    .set({
                      mailboxId: existingMailbox.id,
                      completedAt: createdAt,
                      updatedAt: createdAt,
                    })
                    .where(eq(mailboxConnectSessions.id, connectSession.id));

                  return {
                    mailbox: toMailboxResource(updatedMailbox),
                    redirectUrl: connectSession.redirectUrl,
                    created: false,
                  } satisfies CompletedMailboxConnectSession;
                }

                const mailboxId = createMailboxId();

                const [createdMailbox] = await transaction
                  .insert(mailboxes)
                  .values({
                    id: mailboxId,
                    workspaceId: connectSession.workspaceId,
                    provider: connectSession.provider,
                    tenantExternalId: connectSession.tenantExternalId,
                    mailboxExternalId: connectSession.mailboxExternalId,
                    emailAddress: normalizedEmailAddress,
                    status: "active",
                    syncState: "initializing",
                    watchState: "expired",
                    createdAt,
                    updatedAt: createdAt,
                  })
                  .returning();

                if (createdMailbox === undefined) {
                  throw new Error(`Mailbox ${mailboxId} was not created.`);
                }

                await transaction.insert(gmailMailboxCredentials).values({
                  mailboxId,
                  refreshTokenCiphertext: encryptedRefreshToken,
                  createdAt,
                  updatedAt: createdAt,
                });

                await transaction
                  .update(mailboxConnectSessions)
                  .set({
                    mailboxId,
                    completedAt: createdAt,
                    updatedAt: createdAt,
                  })
                  .where(eq(mailboxConnectSessions.id, connectSession.id));

                return {
                  mailbox: toMailboxResource(createdMailbox),
                  redirectUrl: connectSession.redirectUrl,
                  created: true,
                } satisfies CompletedMailboxConnectSession;
              });
            },
          });
        }),
    };
  }),
);
