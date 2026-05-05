export interface GetV1MailboxesByMailboxIdObservabilityResponse {
    object: GetV1MailboxesByMailboxIdObservabilityResponse.Object_;
    mailboxId: string;
    generatedAt: string;
    lag: GetV1MailboxesByMailboxIdObservabilityResponse.Lag;
    cursor: GetV1MailboxesByMailboxIdObservabilityResponse.Cursor;
    lease: GetV1MailboxesByMailboxIdObservabilityResponse.Lease;
    webhookDeliveries: GetV1MailboxesByMailboxIdObservabilityResponse.WebhookDeliveries.Item[];
    latestSyncRun: GetV1MailboxesByMailboxIdObservabilityResponse.LatestSyncRun | null;
}
export declare namespace GetV1MailboxesByMailboxIdObservabilityResponse {
    const Object_: {
        readonly MailboxObservability: "mailbox_observability";
    };
    type Object_ = (typeof Object_)[keyof typeof Object_];
    interface Lag {
        status: Lag.Status;
        syncState: Lag.SyncState;
        watchState: Lag.WatchState;
        lastSuccessfulSyncAt: string | null;
        lagSeconds: number | null;
    }
    namespace Lag {
        const Status: {
            readonly Active: "active";
            readonly ReconnectRequired: "reconnect_required";
            readonly Disabled: "disabled";
        };
        type Status = (typeof Status)[keyof typeof Status];
        const SyncState: {
            readonly Initializing: "initializing";
            readonly Healthy: "healthy";
            readonly Lagging: "lagging";
            readonly Failed: "failed";
        };
        type SyncState = (typeof SyncState)[keyof typeof SyncState];
        const WatchState: {
            readonly Active: "active";
            readonly Expiring: "expiring";
            readonly Expired: "expired";
            readonly Unhealthy: "unhealthy";
        };
        type WatchState = (typeof WatchState)[keyof typeof WatchState];
    }
    interface Cursor {
        currentCursor: string | null;
        previousCursor: string | null;
        nextCursor: string | null;
        advanced: boolean | null;
        advancedAt: string | null;
    }
    interface Lease {
        activeLeaseOwner: string | null;
        activeLeaseHeartbeatAt: string | null;
        activeLeaseExpiresAt: string | null;
        contentionCount24h: number;
        latestContentionAt: string | null;
        leaseLossCount24h: number;
        latestLeaseLossAt: string | null;
    }
    type WebhookDeliveries = WebhookDeliveries.Item[];
    namespace WebhookDeliveries {
        interface Item {
            webhookEndpointId: string;
            webhookEndpointUrl: string;
            deliveryState: Item.DeliveryState;
            consecutiveFailures: number;
            pendingDeliveries: number;
            processingDeliveries: number;
            failedDeliveries: number;
            lastDeliveryAt: string | null;
            lastDeliveryError: Item.LastDeliveryError | null;
        }
        namespace Item {
            const DeliveryState: {
                readonly Healthy: "healthy";
                readonly Degraded: "degraded";
                readonly Failing: "failing";
            };
            type DeliveryState = (typeof DeliveryState)[keyof typeof DeliveryState];
            interface LastDeliveryError {
                code: string;
                message: string;
                occurredAt: string;
                retryable: boolean;
            }
        }
    }
    interface LatestSyncRun {
        syncRunId: string;
        mailboxId: string;
        startedAt: string;
        completedAt: string | null;
        status: LatestSyncRun.Status;
        detail: string | null;
        eventsEmitted: number | null;
        leaseOwnerId: string | null;
        previousCursor: string | null;
        nextCursor: string | null;
        cursorAdvanced: boolean | null;
    }
    namespace LatestSyncRun {
        const Status: {
            readonly Running: "running";
            readonly Completed: "completed";
            readonly SkippedDueToActiveLease: "skipped_due_to_active_lease";
            readonly ReconnectRequired: "reconnect_required";
            readonly DispatchRetryExhausted: "dispatch_retry_exhausted";
            readonly FailedAfterLeaseAcquired: "failed_after_lease_acquired";
            readonly LeaseLost: "lease_lost";
        };
        type Status = (typeof Status)[keyof typeof Status];
    }
}
