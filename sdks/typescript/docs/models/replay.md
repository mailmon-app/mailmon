# Replay

## Example Usage

```typescript
import { Replay } from "@mailmon.dev/sdk/models";

let value: Replay = {
  id: "<id>",
  object: "replay",
  status: "cancelled",
  mailboxId: "<id>",
  webhookEndpointId: "<id>",
  startTime: new Date("2026-06-05T04:20:02.607Z"),
  endTime: new Date("2026-03-25T09:59:47.147Z"),
  eventsReplayed: 923950,
  createdAt: new Date("2025-06-28T13:35:39.431Z"),
  startedAt: new Date("2025-03-12T04:51:14.683Z"),
  completedAt: new Date("2025-09-23T01:08:12.461Z"),
  lastError: "<value>",
};
```

## Fields

| Field               | Type                                                                                          | Required           | Description |
| ------------------- | --------------------------------------------------------------------------------------------- | ------------------ | ----------- |
| `id`                | _string_                                                                                      | :heavy_check_mark: | N/A         |
| `object`            | [models.ReplayObject](../models/replay-object.md)                                             | :heavy_check_mark: | N/A         |
| `status`            | [models.Status](../models/status.md)                                                          | :heavy_check_mark: | N/A         |
| `mailboxId`         | _string_                                                                                      | :heavy_check_mark: | N/A         |
| `webhookEndpointId` | _string_                                                                                      | :heavy_check_mark: | N/A         |
| `startTime`         | [Date](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Date) | :heavy_check_mark: | N/A         |
| `endTime`           | [Date](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Date) | :heavy_check_mark: | N/A         |
| `eventsReplayed`    | _number_                                                                                      | :heavy_check_mark: | N/A         |
| `createdAt`         | [Date](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Date) | :heavy_check_mark: | N/A         |
| `startedAt`         | [Date](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Date) | :heavy_check_mark: | N/A         |
| `completedAt`       | [Date](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Date) | :heavy_check_mark: | N/A         |
| `lastError`         | _string_                                                                                      | :heavy_check_mark: | N/A         |
