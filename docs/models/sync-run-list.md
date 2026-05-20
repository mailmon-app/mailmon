# SyncRunList

## Example Usage

```typescript
import { SyncRunList } from "@mailmon.dev/sdk/models";

let value: SyncRunList = {
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
};
```

## Fields

| Field                                                         | Type                                                          | Required                                                      | Description                                                   |
| ------------------------------------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------- |
| `object`                                                      | [models.SyncRunListObject](../models/sync-run-list-object.md) | :heavy_check_mark:                                            | N/A                                                           |
| `data`                                                        | [models.SyncRun](../models/sync-run.md)[]                     | :heavy_check_mark:                                            | N/A                                                           |
| `nextCursor`                                                  | *string*                                                      | :heavy_check_mark:                                            | N/A                                                           |