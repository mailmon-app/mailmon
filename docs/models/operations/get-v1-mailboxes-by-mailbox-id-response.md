# GetV1MailboxesByMailboxIdResponse

Mailbox

## Example Usage

```typescript
import { GetV1MailboxesByMailboxIdResponse } from "@mailmon.dev/sdk/models/operations";

let value: GetV1MailboxesByMailboxIdResponse = {
  id: "<id>",
  object: "mailbox",
  provider: "gmail",
  emailAddress: "Yasmin_Larson93@yahoo.com",
  status: "active",
  syncState: "failed",
  watchState: "expiring",
  initializedAt: new Date("2025-06-03T23:32:54.328Z"),
  lastSuccessfulSyncAt: new Date("2026-04-15T12:24:00.108Z"),
  lastError: {
    code: "<value>",
    message: "<value>",
    occurredAt: new Date("2026-08-17T10:23:26.916Z"),
    retryable: true,
  },
};
```

## Fields

| Field                                                                                                                   | Type                                                                                                                    | Required                                                                                                                | Description                                                                                                             |
| ----------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `id`                                                                                                                    | *string*                                                                                                                | :heavy_check_mark:                                                                                                      | N/A                                                                                                                     |
| `object`                                                                                                                | [operations.GetV1MailboxesByMailboxIdObject](../../models/operations/get-v1-mailboxes-by-mailbox-id-object.md)          | :heavy_check_mark:                                                                                                      | N/A                                                                                                                     |
| `provider`                                                                                                              | [operations.GetV1MailboxesByMailboxIdProvider](../../models/operations/get-v1-mailboxes-by-mailbox-id-provider.md)      | :heavy_check_mark:                                                                                                      | N/A                                                                                                                     |
| `emailAddress`                                                                                                          | *string*                                                                                                                | :heavy_check_mark:                                                                                                      | N/A                                                                                                                     |
| `status`                                                                                                                | [operations.GetV1MailboxesByMailboxIdStatus](../../models/operations/get-v1-mailboxes-by-mailbox-id-status.md)          | :heavy_check_mark:                                                                                                      | N/A                                                                                                                     |
| `syncState`                                                                                                             | [operations.GetV1MailboxesByMailboxIdSyncState](../../models/operations/get-v1-mailboxes-by-mailbox-id-sync-state.md)   | :heavy_check_mark:                                                                                                      | N/A                                                                                                                     |
| `watchState`                                                                                                            | [operations.GetV1MailboxesByMailboxIdWatchState](../../models/operations/get-v1-mailboxes-by-mailbox-id-watch-state.md) | :heavy_check_mark:                                                                                                      | N/A                                                                                                                     |
| `initializedAt`                                                                                                         | [Date](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Date)                           | :heavy_check_mark:                                                                                                      | N/A                                                                                                                     |
| `lastSuccessfulSyncAt`                                                                                                  | [Date](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Date)                           | :heavy_check_mark:                                                                                                      | N/A                                                                                                                     |
| `lastError`                                                                                                             | [operations.LastError](../../models/operations/last-error.md)                                                           | :heavy_check_mark:                                                                                                      | N/A                                                                                                                     |