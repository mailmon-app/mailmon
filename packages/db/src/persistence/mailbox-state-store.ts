import { MailboxStateStore } from "@mailmon/core";
import { eq } from "drizzle-orm";
import { Effect, Layer } from "effect";

import { mailboxes } from "../schema.js";
import { MailmonDatabase } from "./database.js";
import { applyMailboxSyncCommit } from "./mailbox-sync-commit.js";
import { toDate } from "./mappers.js";

export const createMailboxStateStoreLayer = Layer.effect(
  MailboxStateStore,
  Effect.gen(function* () {
    const database = yield* MailmonDatabase;

    return {
      getMailboxCursor: (mailboxId: string) =>
        Effect.promise(async () => {
          const [row] = await database.db
            .select({
              cursor: mailboxes.cursor,
            })
            .from(mailboxes)
            .where(eq(mailboxes.id, mailboxId))
            .limit(1);

          return row?.cursor ?? null;
        }),
      applySyncResult: ({ mailboxId, leaseOwnerId, nextCursor, snapshot, syncRunId, syncedAt }) => {
        const syncedAtDate = toDate(syncedAt);

        return Effect.promise(() =>
          database.db.transaction((transaction) =>
            applyMailboxSyncCommit(transaction, {
              mailboxId,
              leaseOwnerId,
              nextCursor,
              snapshot,
              syncRunId,
              syncedAt,
              syncedAtDate,
            }),
          ),
        ).pipe(
          Effect.flatMap((transactionResult) =>
            transactionResult.kind === "failed"
              ? Effect.fail(transactionResult.problem)
              : Effect.succeed(transactionResult.result),
          ),
        );
      },
    };
  }),
);
