import { MailboxWatchProvider } from "@mailmon/core";
import { Effect, Layer } from "effect";

import { createHttpGmailApi } from "./http-api.js";
import { isProblemDetails, makeGmailProblem } from "./problems.js";
import { GmailMailboxCredentialStore, type GmailSyncProviderConfig } from "./services.js";

export const createHttpGmailWatchProviderLayer = (config: GmailSyncProviderConfig) =>
  Layer.effect(
    MailboxWatchProvider,
    Effect.gen(function* () {
      const credentialStore = yield* GmailMailboxCredentialStore;
      const gmailApi = createHttpGmailApi(config);

      return {
        renewMailboxWatch: ({ mailbox }) =>
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
                  code: "gmail_watch_renewal_failed",
                  detail:
                    error instanceof Error
                      ? error.message
                      : "An unexpected Gmail watch renewal error occurred.",
                  mailboxId: mailbox.id,
                  retryable: true,
                  status: 502,
                  title: "Gmail watch renewal failed",
                });
              },
              try: async () => {
                const accessToken = await gmailApi.fetchAccessToken({
                  mailboxId: mailbox.id,
                  refreshToken: credential.refreshToken,
                });

                return gmailApi.watchMailbox({
                  accessToken,
                  mailboxId: mailbox.id,
                });
              },
            });
          }),
      };
    }),
  );
