# Thread

## Example Usage

```typescript
import { Thread } from "@mailmon.dev/sdk/models";

let value: Thread = {
  id: "<id>",
  object: "thread",
  mailboxId: "<id>",
  providerThreadId: "<id>",
  subject: "<value>",
  lastMessageAt: new Date("2026-02-17T20:34:59.810Z"),
  messages: [
    {
      id: "<id>",
      subject: "<value>",
      receivedAt: new Date("2024-10-16T17:52:45.094Z"),
    },
  ],
};
```

## Fields

| Field                                                                                         | Type                                                                                          | Required                                                                                      | Description                                                                                   |
| --------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `id`                                                                                          | *string*                                                                                      | :heavy_check_mark:                                                                            | N/A                                                                                           |
| `object`                                                                                      | [models.ThreadObject](../models/thread-object.md)                                             | :heavy_check_mark:                                                                            | N/A                                                                                           |
| `mailboxId`                                                                                   | *string*                                                                                      | :heavy_check_mark:                                                                            | N/A                                                                                           |
| `providerThreadId`                                                                            | *string*                                                                                      | :heavy_check_mark:                                                                            | N/A                                                                                           |
| `subject`                                                                                     | *string*                                                                                      | :heavy_check_mark:                                                                            | N/A                                                                                           |
| `lastMessageAt`                                                                               | [Date](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Date) | :heavy_check_mark:                                                                            | N/A                                                                                           |
| `messages`                                                                                    | [models.ThreadMessage](../models/thread-message.md)[]                                         | :heavy_check_mark:                                                                            | N/A                                                                                           |