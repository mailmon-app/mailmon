# GetV1ThreadsResponse

Mailbox threads

## Example Usage

```typescript
import { GetV1ThreadsResponse } from "@mailmon.dev/sdk/models/operations";

let value: GetV1ThreadsResponse = {
  object: "list",
  data: [
    {
      id: "<id>",
      object: "thread",
      mailboxId: "<id>",
      providerThreadId: "<id>",
      subject: "<value>",
      lastMessageAt: new Date("2024-09-09T13:57:58.005Z"),
    },
  ],
  nextCursor: "<value>",
};
```

## Fields

| Field                                                                             | Type                                                                              | Required                                                                          | Description                                                                       |
| --------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `object`                                                                          | [operations.GetV1ThreadsObject](../../models/operations/get-v1-threads-object.md) | :heavy_check_mark:                                                                | N/A                                                                               |
| `data`                                                                            | [operations.GetV1ThreadsData](../../models/operations/get-v1-threads-data.md)[]   | :heavy_check_mark:                                                                | N/A                                                                               |
| `nextCursor`                                                                      | *string*                                                                          | :heavy_check_mark:                                                                | N/A                                                                               |