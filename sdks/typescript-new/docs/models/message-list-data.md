# MessageListData

## Example Usage

```typescript
import { MessageListData } from "@mailmon.dev/sdk/models";

let value: MessageListData = {
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
  receivedAt: new Date("2026-12-16T04:02:11.381Z"),
  labelIds: ["<value 1>", "<value 2>"],
};
```

## Fields

| Field               | Type                                                                                          | Required           | Description |
| ------------------- | --------------------------------------------------------------------------------------------- | ------------------ | ----------- |
| `id`                | _string_                                                                                      | :heavy_check_mark: | N/A         |
| `mailboxId`         | _string_                                                                                      | :heavy_check_mark: | N/A         |
| `threadId`          | _string_                                                                                      | :heavy_check_mark: | N/A         |
| `providerMessageId` | _string_                                                                                      | :heavy_check_mark: | N/A         |
| `subject`           | _string_                                                                                      | :heavy_check_mark: | N/A         |
| `from`              | [models.MessageListFrom](../models/message-list-from.md)                                      | :heavy_check_mark: | N/A         |
| `snippet`           | _string_                                                                                      | :heavy_check_mark: | N/A         |
| `receivedAt`        | [Date](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Date) | :heavy_check_mark: | N/A         |
| `labelIds`          | _string_[]                                                                                    | :heavy_check_mark: | N/A         |
