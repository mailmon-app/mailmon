# PostV1ReplaysResponse

Replay created

## Example Usage

```typescript
import { PostV1ReplaysResponse } from "@mailmon.dev/sdk/models/operations";

let value: PostV1ReplaysResponse = {
  id: "<id>",
  object: "replay",
  status: "completed",
  mailboxId: "<id>",
  webhookEndpointId: "<id>",
  startTime: new Date("2026-08-02T00:23:30.164Z"),
  endTime: new Date("2026-05-27T05:52:05.039Z"),
  eventsReplayed: null,
  createdAt: new Date("2024-12-08T02:16:26.118Z"),
  startedAt: new Date("2024-05-21T10:08:35.952Z"),
  completedAt: new Date("2025-06-25T21:58:18.324Z"),
  lastError: "<value>",
};
```

## Fields

| Field                                                                                         | Type                                                                                          | Required                                                                                      | Description                                                                                   |
| --------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `id`                                                                                          | *string*                                                                                      | :heavy_check_mark:                                                                            | N/A                                                                                           |
| `object`                                                                                      | [operations.PostV1ReplaysObject](../../models/operations/post-v1-replays-object.md)           | :heavy_check_mark:                                                                            | N/A                                                                                           |
| `status`                                                                                      | [operations.PostV1ReplaysStatus](../../models/operations/post-v1-replays-status.md)           | :heavy_check_mark:                                                                            | N/A                                                                                           |
| `mailboxId`                                                                                   | *string*                                                                                      | :heavy_check_mark:                                                                            | N/A                                                                                           |
| `webhookEndpointId`                                                                           | *string*                                                                                      | :heavy_check_mark:                                                                            | N/A                                                                                           |
| `startTime`                                                                                   | [Date](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Date) | :heavy_check_mark:                                                                            | N/A                                                                                           |
| `endTime`                                                                                     | [Date](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Date) | :heavy_check_mark:                                                                            | N/A                                                                                           |
| `eventsReplayed`                                                                              | *number*                                                                                      | :heavy_check_mark:                                                                            | N/A                                                                                           |
| `createdAt`                                                                                   | [Date](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Date) | :heavy_check_mark:                                                                            | N/A                                                                                           |
| `startedAt`                                                                                   | [Date](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Date) | :heavy_check_mark:                                                                            | N/A                                                                                           |
| `completedAt`                                                                                 | [Date](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Date) | :heavy_check_mark:                                                                            | N/A                                                                                           |
| `lastError`                                                                                   | *string*                                                                                      | :heavy_check_mark:                                                                            | N/A                                                                                           |