# GetV1MailboxesByMailboxIdSyncRunsResponse

Mailbox sync runs

## Example Usage

```typescript
import { GetV1MailboxesByMailboxIdSyncRunsResponse } from "@mailmon.dev/sdk/models/operations";

let value: GetV1MailboxesByMailboxIdSyncRunsResponse = {
  object: "list",
  data: [],
  nextCursor: "<value>",
};
```

## Fields

| Field                                                                                                                            | Type                                                                                                                             | Required                                                                                                                         | Description                                                                                                                      |
| -------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `object`                                                                                                                         | [operations.GetV1MailboxesByMailboxIdSyncRunsObject](../../models/operations/get-v1-mailboxes-by-mailbox-id-sync-runs-object.md) | :heavy_check_mark:                                                                                                               | N/A                                                                                                                              |
| `data`                                                                                                                           | [models.SyncRun](../../models/sync-run.md)[]                                                                                     | :heavy_check_mark:                                                                                                               | N/A                                                                                                                              |
| `nextCursor`                                                                                                                     | *string*                                                                                                                         | :heavy_check_mark:                                                                                                               | N/A                                                                                                                              |