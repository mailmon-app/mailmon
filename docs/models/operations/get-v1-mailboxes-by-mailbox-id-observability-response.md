# GetV1MailboxesByMailboxIdObservabilityResponse

Mailbox observability

## Example Usage

```typescript
import { GetV1MailboxesByMailboxIdObservabilityResponse } from "@mailmon.dev/sdk/models/operations";

let value: GetV1MailboxesByMailboxIdObservabilityResponse = {
  object: "mailbox_observability",
  mailboxId: "<id>",
  generatedAt: new Date("2024-07-31T21:48:39.940Z"),
  lag: {
    status: "active",
    syncState: "failed",
    watchState: "active",
    lastSuccessfulSyncAt: null,
    lagSeconds: 874997,
  },
  cursor: {
    currentCursor: null,
    previousCursor: "<value>",
    nextCursor: "<value>",
    advanced: true,
    advancedAt: new Date("2025-02-13T05:41:37.765Z"),
  },
  lease: {
    activeLeaseOwner: "<value>",
    activeLeaseHeartbeatAt: new Date("2025-02-06T14:20:29.597Z"),
    activeLeaseExpiresAt: new Date("2026-05-17T06:31:46.257Z"),
    contentionCount24h: 440367,
    latestContentionAt: new Date("2025-09-17T15:30:28.597Z"),
    leaseLossCount24h: 366106,
    latestLeaseLossAt: null,
  },
  webhookDeliveries: [
    {
      webhookEndpointId: "<id>",
      webhookEndpointUrl: "https://infinite-appliance.net/",
      deliveryState: "failing",
      consecutiveFailures: 819803,
      pendingDeliveries: 96268,
      processingDeliveries: 399341,
      failedDeliveries: 820620,
      lastDeliveryAt: null,
      lastDeliveryError: {
        code: "<value>",
        message: "<value>",
        occurredAt: new Date("2025-01-03T15:12:33.154Z"),
        retryable: true,
      },
    },
  ],
  latestSyncRun: {
    syncRunId: "<id>",
    mailboxId: "<id>",
    startedAt: new Date("2026-01-05T09:25:03.978Z"),
    completedAt: new Date("2024-05-16T05:44:44.044Z"),
    status: "dispatch_retry_exhausted",
    detail: "<value>",
    eventsEmitted: 760691,
    leaseOwnerId: null,
    previousCursor: "<value>",
    nextCursor: "<value>",
    cursorAdvanced: false,
  },
};
```

## Fields

| Field                                                                                                                                     | Type                                                                                                                                      | Required                                                                                                                                  | Description                                                                                                                               |
| ----------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `object`                                                                                                                                  | [operations.GetV1MailboxesByMailboxIdObservabilityObject](../../models/operations/get-v1-mailboxes-by-mailbox-id-observability-object.md) | :heavy_check_mark:                                                                                                                        | N/A                                                                                                                                       |
| `mailboxId`                                                                                                                               | *string*                                                                                                                                  | :heavy_check_mark:                                                                                                                        | N/A                                                                                                                                       |
| `generatedAt`                                                                                                                             | [Date](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Date)                                             | :heavy_check_mark:                                                                                                                        | N/A                                                                                                                                       |
| `lag`                                                                                                                                     | [operations.Lag](../../models/operations/lag.md)                                                                                          | :heavy_check_mark:                                                                                                                        | N/A                                                                                                                                       |
| `cursor`                                                                                                                                  | [operations.Cursor](../../models/operations/cursor.md)                                                                                    | :heavy_check_mark:                                                                                                                        | N/A                                                                                                                                       |
| `lease`                                                                                                                                   | [operations.Lease](../../models/operations/lease.md)                                                                                      | :heavy_check_mark:                                                                                                                        | N/A                                                                                                                                       |
| `webhookDeliveries`                                                                                                                       | [operations.WebhookDelivery](../../models/operations/webhook-delivery.md)[]                                                               | :heavy_check_mark:                                                                                                                        | N/A                                                                                                                                       |
| `latestSyncRun`                                                                                                                           | [operations.LatestSyncRun](../../models/operations/latest-sync-run.md)                                                                    | :heavy_check_mark:                                                                                                                        | N/A                                                                                                                                       |