import {
  MailboxObservabilityCatalog,
  type ListMailboxSyncRunsRequest,
  type ListResource,
  type MailboxObservabilitySnapshotResource,
  type MailboxSyncRunInspectionResource,
} from "@mailmon/core";
import { and, asc, desc, eq, gte, inArray, lt, or, sql } from "drizzle-orm";
import { Effect, Layer } from "effect";

import {
  mailboxes,
  syncRuns,
  webhookDeliveries,
  webhookEndpointSubscriptions,
  webhookEndpoints,
} from "../schema.js";
import { MailmonDatabase } from "./database.js";
import {
  decodeSyncRunPaginationCursor,
  encodeSyncRunPaginationCursor,
  getLatestCompletedAt,
  toDate,
  toIsoString,
  toMailboxStatus,
  toMailboxSyncState,
  toMailboxSyncRunInspectionResource,
  toMailboxWatchState,
  toMailboxWebhookDeliveryDegradationResource,
} from "./mappers.js";
import { isProblemDetails } from "./problems.js";

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
          const [mailboxRow] = await database.db
            .select({
              activeSyncLeaseExpiresAt: mailboxes.activeSyncLeaseExpiresAt,
              activeSyncLeaseHeartbeatAt: mailboxes.activeSyncLeaseHeartbeatAt,
              activeSyncLeaseOwner: mailboxes.activeSyncLeaseOwner,
              cursor: mailboxes.cursor,
              id: mailboxes.id,
              lastSuccessfulSyncAt: mailboxes.lastSuccessfulSyncAt,
              status: mailboxes.status,
              syncState: mailboxes.syncState,
              watchState: mailboxes.watchState,
            })
            .from(mailboxes)
            .where(eq(mailboxes.id, mailboxId))
            .limit(1);

          if (mailboxRow === undefined) {
            throw new Error(`Mailbox ${mailboxId} does not exist for observability read.`);
          }

          const [latestSyncRun] = await database.db
            .select()
            .from(syncRuns)
            .where(eq(syncRuns.mailboxId, mailboxId))
            .orderBy(desc(syncRuns.startedAt), desc(syncRuns.id))
            .limit(1);
          const [latestCompletedSyncRun] = await database.db
            .select()
            .from(syncRuns)
            .where(and(eq(syncRuns.mailboxId, mailboxId), eq(syncRuns.status, "completed")))
            .orderBy(desc(syncRuns.startedAt), desc(syncRuns.id))
            .limit(1);
          const syncRunRows = await database.db
            .select({
              completedAt: syncRuns.completedAt,
              status: syncRuns.status,
            })
            .from(syncRuns)
            .where(
              and(
                eq(syncRuns.mailboxId, mailboxId),
                inArray(syncRuns.status, ["skipped_due_to_active_lease", "lease_lost"]),
                gte(syncRuns.completedAt, windowStart),
              ),
            );

          const leaseContentionRows = syncRunRows.filter(
            (row) => row.status === "skipped_due_to_active_lease",
          );
          const leaseLossRows = syncRunRows.filter((row) => row.status === "lease_lost");

          const endpointRows = await database.db
            .select({
              consecutiveFailures: webhookEndpoints.consecutiveDeliveryFailures,
              deliveryState: webhookEndpoints.deliveryState,
              id: webhookEndpoints.id,
              lastDeliveryAt: webhookEndpoints.lastDeliveryAt,
              lastErrorCode: webhookEndpoints.lastErrorCode,
              lastErrorMessage: webhookEndpoints.lastErrorMessage,
              lastErrorOccurredAt: webhookEndpoints.lastErrorOccurredAt,
              lastErrorRetryable: webhookEndpoints.lastErrorRetryable,
              url: webhookEndpoints.url,
            })
            .from(webhookEndpointSubscriptions)
            .innerJoin(
              webhookEndpoints,
              eq(webhookEndpointSubscriptions.webhookEndpointId, webhookEndpoints.id),
            )
            .where(eq(webhookEndpointSubscriptions.mailboxId, mailboxId))
            .orderBy(asc(webhookEndpoints.id));

          const webhookDeliveriesByEndpointId =
            endpointRows.length === 0
              ? new Map<
                  string,
                  {
                    readonly failedDeliveries: number;
                    readonly pendingDeliveries: number;
                    readonly processingDeliveries: number;
                  }
                >()
              : await database.db
                  .select({
                    failedDeliveries: sql<number>`COALESCE(SUM(CASE WHEN ${webhookDeliveries.state} = 'failed' THEN 1 ELSE 0 END), 0)`,
                    pendingDeliveries: sql<number>`COALESCE(SUM(CASE WHEN ${webhookDeliveries.state} = 'pending' THEN 1 ELSE 0 END), 0)`,
                    processingDeliveries: sql<number>`COALESCE(SUM(CASE WHEN ${webhookDeliveries.state} = 'processing' THEN 1 ELSE 0 END), 0)`,
                    webhookEndpointId: webhookDeliveries.webhookEndpointId,
                  })
                  .from(webhookDeliveries)
                  .where(
                    inArray(
                      webhookDeliveries.webhookEndpointId,
                      endpointRows.map((endpoint) => endpoint.id),
                    ),
                  )
                  .groupBy(webhookDeliveries.webhookEndpointId)
                  .then((rows) =>
                    rows.map((row) => ({
                      webhookEndpointId: row.webhookEndpointId,
                      failedDeliveries: Number.parseInt(String(row.failedDeliveries), 10),
                      pendingDeliveries: Number.parseInt(String(row.pendingDeliveries), 10),
                      processingDeliveries: Number.parseInt(String(row.processingDeliveries), 10),
                    })),
                  )
                  .then(
                    (rows) =>
                      new Map(
                        rows.map((row) => [
                          row.webhookEndpointId,
                          {
                            failedDeliveries: row.failedDeliveries,
                            pendingDeliveries: row.pendingDeliveries,
                            processingDeliveries: row.processingDeliveries,
                          },
                        ]),
                      ),
                  );

          const latestSyncRunInspection =
            latestSyncRun === undefined ? null : toMailboxSyncRunInspectionResource(latestSyncRun);
          const latestCompletedSyncRunInspection =
            latestCompletedSyncRun === undefined
              ? null
              : toMailboxSyncRunInspectionResource(latestCompletedSyncRun);

          const cursor = {
            currentCursor: mailboxRow.cursor,
            previousCursor: latestCompletedSyncRunInspection?.previousCursor ?? null,
            nextCursor: latestCompletedSyncRunInspection?.nextCursor ?? null,
            advanced: latestCompletedSyncRunInspection?.cursorAdvanced ?? null,
            advancedAt:
              latestCompletedSyncRunInspection?.cursorAdvanced === true
                ? latestCompletedSyncRunInspection.completedAt
                : null,
          };

          return {
            object: "mailbox_observability",
            mailboxId,
            generatedAt: observedAt,
            lag: {
              status: toMailboxStatus(mailboxRow.status),
              syncState: toMailboxSyncState(mailboxRow.syncState),
              watchState: toMailboxWatchState(mailboxRow.watchState),
              lastSuccessfulSyncAt: toIsoString(mailboxRow.lastSuccessfulSyncAt),
              lagSeconds:
                mailboxRow.lastSuccessfulSyncAt === null
                  ? null
                  : Math.max(
                      0,
                      Math.floor(
                        (observedAtDate.getTime() - mailboxRow.lastSuccessfulSyncAt.getTime()) /
                          1000,
                      ),
                    ),
            },
            cursor,
            lease: {
              activeLeaseOwner: mailboxRow.activeSyncLeaseOwner,
              activeLeaseHeartbeatAt: toIsoString(mailboxRow.activeSyncLeaseHeartbeatAt),
              activeLeaseExpiresAt: toIsoString(mailboxRow.activeSyncLeaseExpiresAt),
              contentionCount24h: leaseContentionRows.length,
              latestContentionAt: toIsoString(getLatestCompletedAt(leaseContentionRows)),
              leaseLossCount24h: leaseLossRows.length,
              latestLeaseLossAt: toIsoString(getLatestCompletedAt(leaseLossRows)),
            },
            webhookDeliveries: endpointRows.map((endpoint) => {
              const counts = webhookDeliveriesByEndpointId.get(endpoint.id) ?? {
                failedDeliveries: 0,
                pendingDeliveries: 0,
                processingDeliveries: 0,
              };

              return toMailboxWebhookDeliveryDegradationResource({
                webhookEndpointId: endpoint.id,
                webhookEndpointUrl: endpoint.url,
                deliveryState: endpoint.deliveryState,
                consecutiveFailures: endpoint.consecutiveFailures,
                pendingDeliveries: counts.pendingDeliveries,
                processingDeliveries: counts.processingDeliveries,
                failedDeliveries: counts.failedDeliveries,
                lastDeliveryAt: endpoint.lastDeliveryAt,
                lastErrorCode: endpoint.lastErrorCode,
                lastErrorMessage: endpoint.lastErrorMessage,
                lastErrorOccurredAt: endpoint.lastErrorOccurredAt,
                lastErrorRetryable: endpoint.lastErrorRetryable,
              });
            }),
            latestSyncRun: latestSyncRunInspection,
          } satisfies MailboxObservabilitySnapshotResource;
        }),
    };
  }),
);
