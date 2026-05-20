# MessageList

## Example Usage

```typescript
import { MessageList } from "@mailmon.dev/sdk/models";

let value: MessageList = {
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
};
```

## Fields

| Field        | Type                                                         | Required           | Description |
| ------------ | ------------------------------------------------------------ | ------------------ | ----------- |
| `object`     | [models.MessageListObject](../models/message-list-object.md) | :heavy_check_mark: | N/A         |
| `data`       | [models.MessageListData](../models/message-list-data.md)[]   | :heavy_check_mark: | N/A         |
| `nextCursor` | _string_                                                     | :heavy_check_mark: | N/A         |
