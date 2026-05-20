# Lag

## Example Usage

```typescript
import { Lag } from "@mailmon.dev/sdk/models";

let value: Lag = {
  status: "disabled",
  syncState: "failed",
  watchState: "unhealthy",
  lastSuccessfulSyncAt: new Date("2026-09-26T23:13:35.118Z"),
  lagSeconds: 240005,
};
```

## Fields

| Field                  | Type                                                                                          | Required           | Description |
| ---------------------- | --------------------------------------------------------------------------------------------- | ------------------ | ----------- |
| `status`               | [models.MailboxStatus](../models/mailbox-status.md)                                           | :heavy_check_mark: | N/A         |
| `syncState`            | [models.SyncState](../models/sync-state.md)                                                   | :heavy_check_mark: | N/A         |
| `watchState`           | [models.WatchState](../models/watch-state.md)                                                 | :heavy_check_mark: | N/A         |
| `lastSuccessfulSyncAt` | [Date](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Date) | :heavy_check_mark: | N/A         |
| `lagSeconds`           | _number_                                                                                      | :heavy_check_mark: | N/A         |
