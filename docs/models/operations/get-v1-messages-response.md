# GetV1MessagesResponse

Mailbox messages

## Example Usage

```typescript
import { GetV1MessagesResponse } from "@mailmon.dev/sdk/models/operations";

let value: GetV1MessagesResponse = {
  object: "list",
  data: [
    {
      id: "<id>",
      mailboxId: "<id>",
      threadId: "<id>",
      providerMessageId: "<id>",
      subject: "<value>",
      from: {
        name: "<value>",
        email: "Reyna10@gmail.com",
      },
      snippet: "<value>",
      receivedAt: new Date("2025-09-17T18:47:33.169Z"),
      labelIds: [
        "<value 1>",
        "<value 2>",
      ],
    },
  ],
  nextCursor: "<value>",
};
```

## Fields

| Field                                                                               | Type                                                                                | Required                                                                            | Description                                                                         |
| ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `object`                                                                            | [operations.GetV1MessagesObject](../../models/operations/get-v1-messages-object.md) | :heavy_check_mark:                                                                  | N/A                                                                                 |
| `data`                                                                              | [operations.GetV1MessagesData](../../models/operations/get-v1-messages-data.md)[]   | :heavy_check_mark:                                                                  | N/A                                                                                 |
| `nextCursor`                                                                        | *string*                                                                            | :heavy_check_mark:                                                                  | N/A                                                                                 |