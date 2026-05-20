# Message

## Example Usage

```typescript
import { Message } from "@mailmon.dev/sdk/models";

let value: Message = {
  id: "<id>",
  mailboxId: "<id>",
  threadId: "<id>",
  providerMessageId: "<id>",
  subject: "<value>",
  from: {
    name: "<value>",
    email: "Aubree.Collins@gmail.com",
  },
  snippet: "<value>",
  receivedAt: new Date("2025-02-09T15:44:30.205Z"),
  labelIds: ["<value 1>"],
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
| `from`              | [models.MessageFrom](../models/message-from.md)                                               | :heavy_check_mark: | N/A         |
| `snippet`           | _string_                                                                                      | :heavy_check_mark: | N/A         |
| `receivedAt`        | [Date](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Date) | :heavy_check_mark: | N/A         |
| `labelIds`          | _string_[]                                                                                    | :heavy_check_mark: | N/A         |
