import { Effect } from "effect";

import type { RepairMailboxesResult } from "./contracts.js";
import { MailboxRepairStore, MailboxSyncDispatcher } from "./services.js";

const DEFAULT_MAILBOX_REPAIR_BATCH_SIZE = 100;

export const repairMailboxes = (
  options: Readonly<{
    limit?: number;
    observedAt?: string;
  }> = {},
) =>
  Effect.gen(function* () {
    const observedAt = options.observedAt ?? new Date().toISOString();
    const limit = options.limit ?? DEFAULT_MAILBOX_REPAIR_BATCH_SIZE;
    const mailboxRepairStore = yield* MailboxRepairStore;
    const dispatcher = yield* MailboxSyncDispatcher;
    const targets = yield* mailboxRepairStore.listMailboxesNeedingRepair({
      limit,
      observedAt,
    });

    const prepared = yield* Effect.forEach(
      targets,
      (target) =>
        mailboxRepairStore
          .prepareMailboxForRepair({
            mailboxId: target.mailbox.id,
            observedAt,
            resetCursor: target.requiresCursorReset,
          })
          .pipe(
            Effect.flatMap((scheduled) =>
              scheduled
                ? dispatcher.dispatchMailboxSync(target.mailbox.id).pipe(
                    Effect.as({
                      dispatched: true,
                      resetCursor: target.requiresCursorReset,
                    }),
                  )
                : Effect.succeed({
                    dispatched: false,
                    resetCursor: false,
                  }),
            ),
          ),
      { concurrency: 10 },
    );

    return {
      completedAt: observedAt,
      cursorResets: prepared.filter((item) => item.resetCursor).length,
      dispatched: prepared.filter((item) => item.dispatched).length,
      kind: "repair_mailboxes",
      scanned: targets.length,
      status: "completed",
    } satisfies RepairMailboxesResult;
  });
