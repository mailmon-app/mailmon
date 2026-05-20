# Mailbox

## Example Usage

```typescript
import { Mailbox } from "@mailmon.dev/sdk/models";

let value: Mailbox = {
  id: "<id>",
  object: "mailbox",
  provider: "gmail",
  emailAddress: "Malcolm_Zboncak-Goodwin@yahoo.com",
  status: "active",
  syncState: "failed",
  watchState: "unhealthy",
  initializedAt: new Date("2025-11-07T17:27:07.284Z"),
  lastSuccessfulSyncAt: new Date("2026-11-11T02:48:11.634Z"),
  lastError: {
    code: "<value>",
    message: "<value>",
    occurredAt: new Date("2024-02-09T22:29:43.782Z"),
    retryable: true,
  },
};
```

## Fields

| Field                  | Type                                                                                          | Required           | Description |
| ---------------------- | --------------------------------------------------------------------------------------------- | ------------------ | ----------- |
| `id`                   | _string_                                                                                      | :heavy_check_mark: | N/A         |
| `object`               | [models.MailboxObject](../models/mailbox-object.md)                                           | :heavy_check_mark: | N/A         |
| `provider`             | [models.MailboxProvider](../models/mailbox-provider.md)                                       | :heavy_check_mark: | N/A         |
| `emailAddress`         | _string_                                                                                      | :heavy_check_mark: | N/A         |
| `status`               | [models.MailboxStatus](../models/mailbox-status.md)                                           | :heavy_check_mark: | N/A         |
| `syncState`            | [models.SyncState](../models/sync-state.md)                                                   | :heavy_check_mark: | N/A         |
| `watchState`           | [models.WatchState](../models/watch-state.md)                                                 | :heavy_check_mark: | N/A         |
| `initializedAt`        | [Date](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Date) | :heavy_check_mark: | N/A         |
| `lastSuccessfulSyncAt` | [Date](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Date) | :heavy_check_mark: | N/A         |
| `lastError`            | [models.ErrorDetail](../models/error-detail.md)                                               | :heavy_check_mark: | N/A         |
