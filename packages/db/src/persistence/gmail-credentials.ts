import { GmailMailboxCredentialStore, GmailRefreshTokenCipher } from "@mailmon/gmail";
import { eq } from "drizzle-orm";
import { Effect, Layer } from "effect";

import { gmailMailboxCredentials } from "../schema.js";
import { MailmonDatabase } from "./database.js";
import { gmailMailboxCredentialReadFailed, gmailMailboxCredentialUnreadable } from "./problems.js";

export const createGmailMailboxCredentialStoreLayer = Layer.effect(
  GmailMailboxCredentialStore,
  Effect.gen(function* () {
    const database = yield* MailmonDatabase;
    const gmailRefreshTokenCipher = yield* GmailRefreshTokenCipher;

    return {
      getGmailMailboxCredential: (mailboxId: string) =>
        Effect.gen(function* () {
          const [row] = yield* Effect.tryPromise({
            catch: () => gmailMailboxCredentialReadFailed(mailboxId),
            try: () => {
              return database.db
                .select({
                  mailboxId: gmailMailboxCredentials.mailboxId,
                  refreshTokenCiphertext: gmailMailboxCredentials.refreshTokenCiphertext,
                })
                .from(gmailMailboxCredentials)
                .where(eq(gmailMailboxCredentials.mailboxId, mailboxId))
                .limit(1);
            },
          });

          if (row === undefined) {
            return null;
          }

          const refreshToken = yield* gmailRefreshTokenCipher
            .decryptRefreshToken(row.refreshTokenCiphertext)
            .pipe(Effect.mapError(() => gmailMailboxCredentialUnreadable(mailboxId)));

          return {
            mailboxId: row.mailboxId,
            refreshToken,
          };
        }),
    };
  }),
);
