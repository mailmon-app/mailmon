# MessagesListResponse

## Example Usage

```typescript
import { MessagesListResponse } from "@mailmon.dev/sdk/models/operations";

let value: MessagesListResponse = {
  result: {
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
          email: "Sandra74@gmail.com",
        },
        snippet: "<value>",
        receivedAt: new Date("2025-11-06T10:09:42.227Z"),
        labelIds: ["<value 1>"],
      },
    ],
    nextCursor: "<value>",
  },
};
```

## Fields

| Field    | Type                                               | Required           | Description |
| -------- | -------------------------------------------------- | ------------------ | ----------- |
| `result` | [models.MessageList](../../models/message-list.md) | :heavy_check_mark: | N/A         |
