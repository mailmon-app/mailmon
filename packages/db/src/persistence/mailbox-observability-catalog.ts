import {
  MailboxObservabilityCatalog,
  type ListMailboxSyncRunsRequest,
  type ListResource,
  type MailboxSyncRunInspectionResource,
} from "@mailmon/core";
import { and, desc, eq, lt, or } from "drizzle-orm";
import { Effect, Layer } from "effect";

import { syncRuns } from "../schema.js";
import { toDate } from "./common-mappers.js";
import { MailmonDatabase } from "./database.js";
import {
  loadLeaseMetrics,
  loadMailboxOperationalRow,
  loadSyncRunInspectionRows,
  loadWebhookDeliveryDegradationRows,
} from "./mailbox-observability-queries.js";
import { assembleMailboxObservabilitySnapshot } from "./mailbox-observability-read-model.js";
import {
  decodeSyncRunPaginationCursor,
  encodeSyncRunPaginationCursor,
} from "./pagination-cursors.js";
import { isProblemDetails } from "./problems.js";
import { toMailboxSyncRunInspectionResource } from "./public-resource-mappers.js";

export const createMailboxObservabilityCatalogLayer = Layer.effect(
  MailboxObservabilityCatalog,
  Effect.gen(function* () {
    const database = yield* MailmonDatabase;

    return {
      listSyncRuns: (request: ListMailboxSyncRunsRequest) =>
        Effect.tryPromise({
          catch: (error) => {
            if (isProblemDetails(error)) {
              return error;
            }

            throw error;
          },
          try: async () => {
            const paginationCursor =
              request.cursor === null ? null : decodeSyncRunPaginationCursor(request.cursor);
            const whereClause =
              paginationCursor === null
                ? eq(syncRuns.mailboxId, request.mailboxId)
                : and(
                    eq(syncRuns.mailboxId, request.mailboxId),
                    or(
                      lt(syncRuns.startedAt, toDate(paginationCursor.startedAt)),
                      and(
                        eq(syncRuns.startedAt, toDate(paginationCursor.startedAt)),
                        lt(syncRuns.id, paginationCursor.id),
                      ),
                    ),
                  );
            const rows = await database.db
              .select()
              .from(syncRuns)
              .where(whereClause)
              .orderBy(desc(syncRuns.startedAt), desc(syncRuns.id))
              .limit(request.limit + 1);
            const pageRows = rows.slice(0, request.limit);
            const nextCursor =
              rows.length > request.limit
                ? encodeSyncRunPaginationCursor({
                    id: pageRows[pageRows.length - 1]?.id ?? rows[request.limit - 1]!.id,
                    startedAt:
                      pageRows[pageRows.length - 1]?.startedAt.toISOString() ??
                      rows[request.limit - 1]!.startedAt.toISOString(),
                  })
                : null;

            return {
              object: "list",
              data: pageRows.map((row) => toMailboxSyncRunInspectionResource(row)),
              nextCursor,
            } satisfies ListResource<MailboxSyncRunInspectionResource>;
          },
        }),
      getMailboxObservability: ({ mailboxId, observedAt }) =>
        Effect.promise(async () => {
          const observedAtDate = toDate(observedAt);
          const windowStart = new Date(observedAtDate.getTime() - 24 * 60 * 60 * 1000);
          const mailboxRow = await loadMailboxOperationalRow(database.db, mailboxId);

          if (mailboxRow === undefined) {
            throw new Error(`Mailbox ${mailboxId} does not exist for observability read.`);
          }

          const [syncRunRows, leaseMetrics, webhookDeliveryRows] = await Promise.all([
            loadSyncRunInspectionRows(database.db, mailboxId),
            loadLeaseMetrics(database.db, { mailboxId, windowStart }),
            loadWebhookDeliveryDegradationRows(database.db, mailboxId),
          ]);

          return assembleMailboxObservabilitySnapshot({
            mailboxId,
            observedAt,
            observedAtDate,
            mailbox: mailboxRow,
            syncRuns: syncRunRows,
            leaseMetrics,
            webhookDeliveries: webhookDeliveryRows,
          });
        }),
    };
  }),
);
