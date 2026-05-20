# MailboxesListSyncRunsResponse

## Example Usage

```typescript
import { MailboxesListSyncRunsResponse } from "@mailmon.dev/sdk/models/operations";

let value: MailboxesListSyncRunsResponse = {
  result: {
    object: "list",
    data: [
      {
        syncRunId: "<id>",
        mailboxId: "<id>",
        startedAt: new Date("2024-09-01T12:48:55.635Z"),
        completedAt: new Date("2024-12-06T13:35:53.133Z"),
        status: "failed_after_lease_acquired",
        detail: "<value>",
        eventsEmitted: 754397,
        leaseOwnerId: "<id>",
        previousCursor: "<value>",
        nextCursor: "<value>",
        cursorAdvanced: false,
      },
    ],
    nextCursor: "<value>",
  },
};
```

## Fields

| Field    | Type                                                | Required           | Description |
| -------- | --------------------------------------------------- | ------------------ | ----------- |
| `result` | [models.SyncRunList](../../models/sync-run-list.md) | :heavy_check_mark: | N/A         |
