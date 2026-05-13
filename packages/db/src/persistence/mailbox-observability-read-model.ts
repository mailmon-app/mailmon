import type { MailboxObservabilitySnapshotResource } from "@mailmon/core";

import { toIsoString } from "./common-mappers.js";
import type {
  LeaseMetrics,
  MailboxOperationalRow,
  SyncRunInspectionRows,
  WebhookDeliveryCounts,
  WebhookDeliveryDegradationRows,
} from "./mailbox-observability-queries.js";
import {
  toMailboxStatus,
  toMailboxSyncState,
  toMailboxSyncRunInspectionResource,
  toMailboxWatchState,
  toMailboxWebhookDeliveryDegradationResource,
} from "./public-resource-mappers.js";

const emptyDeliveryCounts: WebhookDeliveryCounts = {
  failedDeliveries: 0,
  pendingDeliveries: 0,
  processingDeliveries: 0,
};

export const assembleMailboxObservabilitySnapshot = (
  params: Readonly<{
    mailboxId: string;
    observedAt: string;
    observedAtDate: Date;
    mailbox: MailboxOperationalRow;
    syncRuns: SyncRunInspectionRows;
    leaseMetrics: LeaseMetrics;
    webhookDeliveries: WebhookDeliveryDegradationRows;
  }>,
): MailboxObservabilitySnapshotResource => {
  const latestSyncRunInspection =
    params.syncRuns.latestSyncRun === null
      ? null
      : toMailboxSyncRunInspectionResource(params.syncRuns.latestSyncRun);
  const latestCompletedSyncRunInspection =
    params.syncRuns.latestCompletedSyncRun === null
      ? null
      : toMailboxSyncRunInspectionResource(params.syncRuns.latestCompletedSyncRun);

  return {
    object: "mailbox_observability",
    mailboxId: params.mailboxId,
    generatedAt: params.observedAt,
    lag: {
      status: toMailboxStatus(params.mailbox.status),
      syncState: toMailboxSyncState(params.mailbox.syncState),
      watchState: toMailboxWatchState(params.mailbox.watchState),
      lastSuccessfulSyncAt: toIsoString(params.mailbox.lastSuccessfulSyncAt),
      lagSeconds:
        params.mailbox.lastSuccessfulSyncAt === null
          ? null
          : Math.max(
              0,
              Math.floor(
                (params.observedAtDate.getTime() - params.mailbox.lastSuccessfulSyncAt.getTime()) /
                  1000,
              ),
            ),
    },
    cursor: {
      currentCursor: params.mailbox.cursor,
      previousCursor: latestCompletedSyncRunInspection?.previousCursor ?? null,
      nextCursor: latestCompletedSyncRunInspection?.nextCursor ?? null,
      advanced: latestCompletedSyncRunInspection?.cursorAdvanced ?? null,
      advancedAt:
        latestCompletedSyncRunInspection?.cursorAdvanced === true
          ? latestCompletedSyncRunInspection.completedAt
          : null,
    },
    lease: {
      activeLeaseOwner: params.mailbox.activeSyncLeaseOwner,
      activeLeaseHeartbeatAt: toIsoString(params.mailbox.activeSyncLeaseHeartbeatAt),
      activeLeaseExpiresAt: toIsoString(params.mailbox.activeSyncLeaseExpiresAt),
      contentionCount24h: params.leaseMetrics.contentionCount24h,
      latestContentionAt: toIsoString(params.leaseMetrics.latestContentionAt),
      leaseLossCount24h: params.leaseMetrics.leaseLossCount24h,
      latestLeaseLossAt: toIsoString(params.leaseMetrics.latestLeaseLossAt),
    },
    webhookDeliveries: params.webhookDeliveries.endpointRows.map((endpoint) => {
      const counts =
        params.webhookDeliveries.deliveryCountsByEndpointId.get(endpoint.id) ?? emptyDeliveryCounts;

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
  };
};
