# SyncRunListData

## Example Usage

```typescript
import { SyncRunListData } from "@mailmon.dev/sdk/models";

let value: SyncRunListData = {
  syncRunId: "<id>",
  mailboxId: "<id>",
  startedAt: new Date("2026-12-10T11:30:36.621Z"),
  completedAt: new Date("2026-05-16T23:22:53.707Z"),
  status: "failed_after_lease_acquired",
  detail: null,
  eventsEmitted: 891948,
  leaseOwnerId: "<id>",
  previousCursor: "<value>",
  nextCursor: "<value>",
  cursorAdvanced: true,
};
```

## Fields

| Field                                                                                         | Type                                                                                          | Required                                                                                      | Description                                                                                   |
| --------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `syncRunId`                                                                                   | *string*                                                                                      | :heavy_check_mark:                                                                            | N/A                                                                                           |
| `mailboxId`                                                                                   | *string*                                                                                      | :heavy_check_mark:                                                                            | N/A                                                                                           |
| `startedAt`                                                                                   | [Date](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Date) | :heavy_check_mark:                                                                            | N/A                                                                                           |
| `completedAt`                                                                                 | [Date](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Date) | :heavy_check_mark:                                                                            | N/A                                                                                           |
| `status`                                                                                      | [models.SyncRunListStatus](../models/sync-run-list-status.md)                                 | :heavy_check_mark:                                                                            | N/A                                                                                           |
| `detail`                                                                                      | *string*                                                                                      | :heavy_check_mark:                                                                            | N/A                                                                                           |
| `eventsEmitted`                                                                               | *number*                                                                                      | :heavy_check_mark:                                                                            | N/A                                                                                           |
| `leaseOwnerId`                                                                                | *string*                                                                                      | :heavy_check_mark:                                                                            | N/A                                                                                           |
| `previousCursor`                                                                              | *string*                                                                                      | :heavy_check_mark:                                                                            | N/A                                                                                           |
| `nextCursor`                                                                                  | *string*                                                                                      | :heavy_check_mark:                                                                            | N/A                                                                                           |
| `cursorAdvanced`                                                                              | *boolean*                                                                                     | :heavy_check_mark:                                                                            | N/A                                                                                           |