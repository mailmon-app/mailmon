import { MailboxRepairStore } from "@mailmon/core";
import { and, asc, desc, eq, isNull, lte, or, sql } from "drizzle-orm";
import { Effect, Layer } from "effect";

import { mailboxes } from "../schema.js";
import { toDate } from "./common-mappers.js";
import { MailmonDatabase } from "./database.js";
import { toMailboxRepairTarget } from "./public-resource-mappers.js";

export const createMailboxRepairStoreLayer = Layer.effect(
  MailboxRepairStore,
  Effect.gen(function* () {
    const database = yield* MailmonDatabase;

    return {
      listMailboxesNeedingRepair: ({ limit, observedAt }) =>
        Effect.promise(async () => {
          const observedAtDate = toDate(observedAt);
          const rows = await database.db
            .select()
            .from(mailboxes)
            .where(
              and(
                eq(mailboxes.provider, "gmail"),
                eq(mailboxes.status, "active"),
                or(
                  eq(mailboxes.lastErrorCode, "gmail_history_cursor_invalid"),
                  eq(mailboxes.watchState, "expired"),
                  eq(mailboxes.watchState, "unhealthy"),
                ),
                or(
                  isNull(mailboxes.activeSyncLeaseExpiresAt),
                  lte(mailboxes.activeSyncLeaseExpiresAt, observedAtDate),
                ),
              ),
            )
            .orderBy(
              desc(
                sql`CASE WHEN ${mailboxes.lastErrorCode} = 'gmail_history_cursor_invalid' THEN 1 ELSE 0 END`,
              ),
              asc(mailboxes.lastErrorOccurredAt),
              asc(mailboxes.watchExpirationAt),
              asc(mailboxes.id),
            )
            .limit(limit)
            .for("update", { skipLocked: true });

          return rows.map((row) => toMailboxRepairTarget(row));
        }),
      prepareMailboxForRepair: ({ mailboxId, observedAt, resetCursor }) =>
        Effect.promise(async () => {
          const observedAtDate = toDate(observedAt);
          const [updatedMailbox] = await database.db
            .update(mailboxes)
            .set({
              ...(resetCursor ? { cursor: null } : {}),
              syncState: "lagging",
              updatedAt: observedAtDate,
            })
            .where(and(eq(mailboxes.id, mailboxId), eq(mailboxes.status, "active")))
            .returning({ id: mailboxes.id });

          return updatedMailbox !== undefined;
        }),
    };
  }),
);
