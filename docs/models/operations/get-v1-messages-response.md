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
        email: "Marta22@hotmail.com",
      },
      snippet: "<value>",
      receivedAt: new Date("2026-01-12T13:18:05.978Z"),
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
| `data`                                                                              | [models.Message](../../models/message.md)[]                                         | :heavy_check_mark:                                                                  | N/A                                                                                 |
| `nextCursor`                                                                        | *string*                                                                            | :heavy_check_mark:                                                                  | N/A                                                                                 |