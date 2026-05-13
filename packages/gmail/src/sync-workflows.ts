import { MailboxSyncProvider, type MailboxProviderSyncResult } from "@mailmon/core";
import { Effect, Layer } from "effect";

import { mergeInitialSyncMessages, toSyncSnapshot } from "./canonical-projection.js";
import { createHttpGmailApi } from "./http-api.js";
import { makeGmailProblem, isProblemDetails } from "./problems.js";
import { GmailMailboxCredentialStore, type GmailSyncProviderConfig } from "./services.js";

export const createHttpGmailSyncProviderLayer = (config: GmailSyncProviderConfig) =>
  Layer.effect(
    MailboxSyncProvider,
    Effect.gen(function* () {
      const credentialStore = yield* GmailMailboxCredentialStore;
      const gmailApi = createHttpGmailApi(config);

      return {
        syncMailbox: ({ cursor, mailbox }) =>
          Effect.gen(function* () {
            const credential = yield* credentialStore.getGmailMailboxCredential(mailbox.id);

            if (credential === null) {
              return yield* Effect.fail(
                makeGmailProblem({
                  code: "gmail_mailbox_credentials_missing",
                  detail: `Mailbox ${mailbox.id} has no stored Gmail refresh token.`,
                  mailboxId: mailbox.id,
                  retryable: false,
                  status: 409,
                  title: "Gmail mailbox credentials missing",
                }),
              );
            }

            return yield* Effect.tryPromise({
              catch: (error) => {
                if (isProblemDetails(error)) {
                  return error;
                }

                return makeGmailProblem({
                  code: "gmail_sync_failed",
                  detail:
                    error instanceof Error
                      ? error.message
                      : "An unexpected Gmail sync error occurred.",
                  mailboxId: mailbox.id,
                  retryable: true,
                  status: 502,
                  title: "Gmail sync failed",
                });
              },
              try: async () => {
                const accessToken = await gmailApi.fetchAccessToken({
                  mailboxId: mailbox.id,
                  refreshToken: credential.refreshToken,
                });

                if (cursor === null) {
                  const profile = await gmailApi.getProfile({
                    accessToken,
                    mailboxId: mailbox.id,
                  });
                  const baselineMessages = await gmailApi.listAllMessages({
                    accessToken,
                    mailboxId: mailbox.id,
                  });
                  const catchUp = await gmailApi.listHistoryDelta({
                    accessToken,
                    cursor: profile.historyId,
                    mailboxId: mailbox.id,
                  });
                  const messages = mergeInitialSyncMessages(baselineMessages, catchUp);

                  return {
                    eventsEmitted: messages.length + catchUp.deletedMessageIds.length,
                    nextCursor: catchUp.nextCursor,
                    snapshot: toSyncSnapshot(mailbox.id, messages, catchUp.deletedMessageIds),
                  } satisfies MailboxProviderSyncResult;
                }

                const historyDelta = await gmailApi.listHistoryDelta({
                  accessToken,
                  cursor,
                  mailboxId: mailbox.id,
                });

                return {
                  eventsEmitted:
                    historyDelta.messages.length + historyDelta.deletedMessageIds.length,
                  nextCursor: historyDelta.nextCursor,
                  snapshot: toSyncSnapshot(
                    mailbox.id,
                    historyDelta.messages,
                    historyDelta.deletedMessageIds,
                  ),
                } satisfies MailboxProviderSyncResult;
              },
            });
          }),
      };
    }),
  );
