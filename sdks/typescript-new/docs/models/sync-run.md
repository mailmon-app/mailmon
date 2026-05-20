# SyncRun

## Example Usage

```typescript
import { SyncRun } from "@mailmon.dev/sdk/models";

let value: SyncRun = {
  syncRunId: "<id>",
  mailboxId: "<id>",
  startedAt: new Date("2026-08-27T15:24:29.512Z"),
  completedAt: new Date("2025-11-06T03:04:01.166Z"),
  status: "lease_lost",
  detail: "<value>",
  eventsEmitted: 181706,
  leaseOwnerId: "<id>",
  previousCursor: "<value>",
  nextCursor: "<value>",
  cursorAdvanced: false,
};
```

## Fields

| Field            | Type                                                                                          | Required           | Description |
| ---------------- | --------------------------------------------------------------------------------------------- | ------------------ | ----------- |
| `syncRunId`      | _string_                                                                                      | :heavy_check_mark: | N/A         |
| `mailboxId`      | _string_                                                                                      | :heavy_check_mark: | N/A         |
| `startedAt`      | [Date](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Date) | :heavy_check_mark: | N/A         |
| `completedAt`    | [Date](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Date) | :heavy_check_mark: | N/A         |
| `status`         | [models.SyncRunStatus](../models/sync-run-status.md)                                          | :heavy_check_mark: | N/A         |
| `detail`         | _string_                                                                                      | :heavy_check_mark: | N/A         |
| `eventsEmitted`  | _number_                                                                                      | :heavy_check_mark: | N/A         |
| `leaseOwnerId`   | _string_                                                                                      | :heavy_check_mark: | N/A         |
| `previousCursor` | _string_                                                                                      | :heavy_check_mark: | N/A         |
| `nextCursor`     | _string_                                                                                      | :heavy_check_mark: | N/A         |
| `cursorAdvanced` | _boolean_                                                                                     | :heavy_check_mark: | N/A         |
