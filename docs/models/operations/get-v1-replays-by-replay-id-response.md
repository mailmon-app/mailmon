# GetV1ReplaysByReplayIdResponse

Replay

## Example Usage

```typescript
import { GetV1ReplaysByReplayIdResponse } from "@mailmon.dev/sdk/models/operations";

let value: GetV1ReplaysByReplayIdResponse = {
  id: "<id>",
  object: "replay",
  status: "failed",
  mailboxId: "<id>",
  webhookEndpointId: "<id>",
  startTime: new Date("2026-04-16T19:52:15.613Z"),
  endTime: new Date("2025-06-06T18:04:41.662Z"),
  eventsReplayed: 373630,
  createdAt: new Date("2026-10-10T15:40:17.322Z"),
  startedAt: new Date("2025-11-21T12:25:45.156Z"),
  completedAt: new Date("2025-10-03T03:13:21.709Z"),
  lastError: "<value>",
};
```

## Fields

| Field                                                                                                    | Type                                                                                                     | Required                                                                                                 | Description                                                                                              |
| -------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `id`                                                                                                     | *string*                                                                                                 | :heavy_check_mark:                                                                                       | N/A                                                                                                      |
| `object`                                                                                                 | [operations.GetV1ReplaysByReplayIdObject](../../models/operations/get-v1-replays-by-replay-id-object.md) | :heavy_check_mark:                                                                                       | N/A                                                                                                      |
| `status`                                                                                                 | [operations.GetV1ReplaysByReplayIdStatus](../../models/operations/get-v1-replays-by-replay-id-status.md) | :heavy_check_mark:                                                                                       | N/A                                                                                                      |
| `mailboxId`                                                                                              | *string*                                                                                                 | :heavy_check_mark:                                                                                       | N/A                                                                                                      |
| `webhookEndpointId`                                                                                      | *string*                                                                                                 | :heavy_check_mark:                                                                                       | N/A                                                                                                      |
| `startTime`                                                                                              | [Date](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Date)            | :heavy_check_mark:                                                                                       | N/A                                                                                                      |
| `endTime`                                                                                                | [Date](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Date)            | :heavy_check_mark:                                                                                       | N/A                                                                                                      |
| `eventsReplayed`                                                                                         | *number*                                                                                                 | :heavy_check_mark:                                                                                       | N/A                                                                                                      |
| `createdAt`                                                                                              | [Date](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Date)            | :heavy_check_mark:                                                                                       | N/A                                                                                                      |
| `startedAt`                                                                                              | [Date](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Date)            | :heavy_check_mark:                                                                                       | N/A                                                                                                      |
| `completedAt`                                                                                            | [Date](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Date)            | :heavy_check_mark:                                                                                       | N/A                                                                                                      |
| `lastError`                                                                                              | *string*                                                                                                 | :heavy_check_mark:                                                                                       | N/A                                                                                                      |