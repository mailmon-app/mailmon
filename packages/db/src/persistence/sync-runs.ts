import { SyncRunStore, type CompletedSyncRun } from "@mailmon/core";
import { eq } from "drizzle-orm";
import { Effect, Layer } from "effect";

import { mailboxes, syncRuns } from "../schema.js";
import { toDate } from "./common-mappers.js";
import { MailmonDatabase } from "./database.js";
import {
  createStartedSyncRun,
  toCompletedSyncRunMailboxTransitionUpdate,
} from "./operational-state-mappers.js";

export const createSyncRunStoreLayer = Layer.effect(
  SyncRunStore,
  Effect.gen(function* () {
    const database = yield* MailmonDatabase;

    return {
      startSyncRun: (mailboxId: string) =>
        Effect.promise(async () => {
          const startedSyncRun = createStartedSyncRun(mailboxId);
          const [mailbox] = await database.db
            .select({
              cursor: mailboxes.cursor,
            })
            .from(mailboxes)
            .where(eq(mailboxes.id, mailboxId))
            .limit(1);

          await database.db.insert(syncRuns).values({
            id: startedSyncRun.syncRunId,
            mailboxId: startedSyncRun.mailboxId,
            previousCursor: mailbox?.cursor ?? null,
            status: "running",
            startedAt: toDate(startedSyncRun.startedAt),
          });

          return startedSyncRun;
        }),
      completeSyncRun: (result: CompletedSyncRun) =>
        Effect.promise(async () => {
          const completedAt = toDate(result.completedAt);
          const mailboxTransitionUpdate = toCompletedSyncRunMailboxTransitionUpdate(result);

          await database.db.transaction(async (transaction) => {
            await transaction
              .update(syncRuns)
              .set({
                completedAt,
                detail: result.detail,
                eventsEmitted: String(result.eventsEmitted),
                nextCursor: result.nextCursor,
                status: result.status,
              })
              .where(eq(syncRuns.id, result.syncRunId));

            if (
              result.status === "skipped_due_to_active_lease" ||
              (result.status === "reconnect_required" &&
                result.detail === "mailbox_reconnect_required")
            ) {
              return;
            }

            if (mailboxTransitionUpdate !== null) {
              await transaction
                .update(mailboxes)
                .set({
                  ...mailboxTransitionUpdate,
                  updatedAt: completedAt,
                })
                .where(eq(mailboxes.id, result.mailboxId));
            }
          });
        }),
    };
  }),
);
