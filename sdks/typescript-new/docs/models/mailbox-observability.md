# MailboxObservability

## Example Usage

```typescript
import { MailboxObservability } from "@mailmon.dev/sdk/models";

let value: MailboxObservability = {
  object: "mailbox_observability",
  mailboxId: "<id>",
  generatedAt: new Date("2026-06-29T21:07:03.724Z"),
  lag: {
    status: "reconnect_required",
    syncState: "failed",
    watchState: "active",
    lastSuccessfulSyncAt: new Date("2024-05-19T18:46:19.572Z"),
    lagSeconds: 953463,
  },
  cursor: {
    currentCursor: "<value>",
    previousCursor: "<value>",
    nextCursor: "<value>",
    advanced: null,
    advancedAt: new Date("2024-04-17T04:49:28.455Z"),
  },
  lease: {
    activeLeaseOwner: "<value>",
    activeLeaseHeartbeatAt: new Date("2025-01-25T03:46:45.998Z"),
    activeLeaseExpiresAt: new Date("2024-12-12T01:12:51.805Z"),
    contentionCount24h: 937525,
    latestContentionAt: new Date("2024-04-21T23:51:28.579Z"),
    leaseLossCount24h: 652863,
    latestLeaseLossAt: new Date("2025-03-29T06:43:01.679Z"),
  },
  webhookDeliveries: [],
  latestSyncRun: {
    syncRunId: "<id>",
    mailboxId: "<id>",
    startedAt: new Date("2025-01-22T06:19:54.319Z"),
    completedAt: null,
    status: "running",
    detail: "<value>",
    eventsEmitted: 891372,
    leaseOwnerId: "<id>",
    previousCursor: "<value>",
    nextCursor: "<value>",
    cursorAdvanced: true,
  },
};
```

## Fields

| Field               | Type                                                                                          | Required           | Description |
| ------------------- | --------------------------------------------------------------------------------------------- | ------------------ | ----------- |
| `object`            | [models.MailboxObservabilityObject](../models/mailbox-observability-object.md)                | :heavy_check_mark: | N/A         |
| `mailboxId`         | _string_                                                                                      | :heavy_check_mark: | N/A         |
| `generatedAt`       | [Date](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Date) | :heavy_check_mark: | N/A         |
| `lag`               | [models.Lag](../models/lag.md)                                                                | :heavy_check_mark: | N/A         |
| `cursor`            | [models.Cursor](../models/cursor.md)                                                          | :heavy_check_mark: | N/A         |
| `lease`             | [models.Lease](../models/lease.md)                                                            | :heavy_check_mark: | N/A         |
| `webhookDeliveries` | [models.WebhookDelivery](../models/webhook-delivery.md)[]                                     | :heavy_check_mark: | N/A         |
| `latestSyncRun`     | [models.SyncRun](../models/sync-run.md)                                                       | :heavy_check_mark: | N/A         |
