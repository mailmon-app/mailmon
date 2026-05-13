import { and, asc, desc, eq, gte, inArray, sql } from "drizzle-orm";

import {
  mailboxes,
  syncRuns,
  webhookDeliveries,
  webhookEndpointSubscriptions,
  webhookEndpoints,
} from "../schema.js";
import { getLatestCompletedAt } from "./common-mappers.js";
import type { DatabaseHandle } from "./database.js";

type ObservabilityDb = DatabaseHandle["db"];

export const loadMailboxOperationalRow = (db: ObservabilityDb, mailboxId: string) =>
  db
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
    .limit(1)
    .then(([row]) => row);

export type MailboxOperationalRow = NonNullable<
  Awaited<ReturnType<typeof loadMailboxOperationalRow>>
>;

export const loadSyncRunInspectionRows = async (db: ObservabilityDb, mailboxId: string) => {
  const [latestSyncRun] = await db
    .select()
    .from(syncRuns)
    .where(eq(syncRuns.mailboxId, mailboxId))
    .orderBy(desc(syncRuns.startedAt), desc(syncRuns.id))
    .limit(1);
  const [latestCompletedSyncRun] = await db
    .select()
    .from(syncRuns)
    .where(and(eq(syncRuns.mailboxId, mailboxId), eq(syncRuns.status, "completed")))
    .orderBy(desc(syncRuns.startedAt), desc(syncRuns.id))
    .limit(1);

  return {
    latestSyncRun: latestSyncRun ?? null,
    latestCompletedSyncRun: latestCompletedSyncRun ?? null,
  };
};

export type SyncRunInspectionRows = Awaited<ReturnType<typeof loadSyncRunInspectionRows>>;

export const loadLeaseMetrics = async (
  db: ObservabilityDb,
  params: Readonly<{
    mailboxId: string;
    windowStart: Date;
  }>,
) => {
  const syncRunRows = await db
    .select({
      completedAt: syncRuns.completedAt,
      status: syncRuns.status,
    })
    .from(syncRuns)
    .where(
      and(
        eq(syncRuns.mailboxId, params.mailboxId),
        inArray(syncRuns.status, ["skipped_due_to_active_lease", "lease_lost"]),
        gte(syncRuns.completedAt, params.windowStart),
      ),
    );

  const contentionRows = syncRunRows.filter((row) => row.status === "skipped_due_to_active_lease");
  const leaseLossRows = syncRunRows.filter((row) => row.status === "lease_lost");

  return {
    contentionCount24h: contentionRows.length,
    latestContentionAt: getLatestCompletedAt(contentionRows),
    leaseLossCount24h: leaseLossRows.length,
    latestLeaseLossAt: getLatestCompletedAt(leaseLossRows),
  };
};

export type LeaseMetrics = Awaited<ReturnType<typeof loadLeaseMetrics>>;

export const loadWebhookDeliveryDegradationRows = async (
  db: ObservabilityDb,
  mailboxId: string,
) => {
  const endpointRows = await db
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

  const deliveryCountsByEndpointId =
    endpointRows.length === 0
      ? new Map<string, WebhookDeliveryCounts>()
      : await db
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
          .then(
            (rows) =>
              new Map(
                rows.map((row) => [
                  row.webhookEndpointId,
                  {
                    failedDeliveries: Number.parseInt(String(row.failedDeliveries), 10),
                    pendingDeliveries: Number.parseInt(String(row.pendingDeliveries), 10),
                    processingDeliveries: Number.parseInt(String(row.processingDeliveries), 10),
                  },
                ]),
              ),
          );

  return {
    endpointRows,
    deliveryCountsByEndpointId,
  };
};

export type WebhookDeliveryDegradationRows = Awaited<
  ReturnType<typeof loadWebhookDeliveryDegradationRows>
>;

export interface WebhookDeliveryCounts {
  readonly failedDeliveries: number;
  readonly pendingDeliveries: number;
  readonly processingDeliveries: number;
}
