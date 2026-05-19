# LatestSyncRun

## Example Usage

```typescript
import { LatestSyncRun } from "@mailmon.dev/sdk/models/operations";

let value: LatestSyncRun = {
  syncRunId: "<id>",
  mailboxId: "<id>",
  startedAt: new Date("2025-06-22T15:16:18.013Z"),
  completedAt: new Date("2026-12-01T08:35:45.264Z"),
  status: "reconnect_required",
  detail: "<value>",
  eventsEmitted: null,
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
| `status`                                                                                      | [operations.LatestSyncRunStatus](../../models/operations/latest-sync-run-status.md)           | :heavy_check_mark:                                                                            | N/A                                                                                           |
| `detail`                                                                                      | *string*                                                                                      | :heavy_check_mark:                                                                            | N/A                                                                                           |
| `eventsEmitted`                                                                               | *number*                                                                                      | :heavy_check_mark:                                                                            | N/A                                                                                           |
| `leaseOwnerId`                                                                                | *string*                                                                                      | :heavy_check_mark:                                                                            | N/A                                                                                           |
| `previousCursor`                                                                              | *string*                                                                                      | :heavy_check_mark:                                                                            | N/A                                                                                           |
| `nextCursor`                                                                                  | *string*                                                                                      | :heavy_check_mark:                                                                            | N/A                                                                                           |
| `cursorAdvanced`                                                                              | *boolean*                                                                                     | :heavy_check_mark:                                                                            | N/A                                                                                           |