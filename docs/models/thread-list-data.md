# ThreadListData

## Example Usage

```typescript
import { ThreadListData } from "@mailmon.dev/sdk/models";

let value: ThreadListData = {
  id: "<id>",
  object: "thread",
  mailboxId: "<id>",
  providerThreadId: "<id>",
  subject: "<value>",
  lastMessageAt: new Date("2025-06-08T02:31:28.141Z"),
};
```

## Fields

| Field                                                                                         | Type                                                                                          | Required                                                                                      | Description                                                                                   |
| --------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `id`                                                                                          | *string*                                                                                      | :heavy_check_mark:                                                                            | N/A                                                                                           |
| `object`                                                                                      | [models.ThreadListObjectThread](../models/thread-list-object-thread.md)                       | :heavy_check_mark:                                                                            | N/A                                                                                           |
| `mailboxId`                                                                                   | *string*                                                                                      | :heavy_check_mark:                                                                            | N/A                                                                                           |
| `providerThreadId`                                                                            | *string*                                                                                      | :heavy_check_mark:                                                                            | N/A                                                                                           |
| `subject`                                                                                     | *string*                                                                                      | :heavy_check_mark:                                                                            | N/A                                                                                           |
| `lastMessageAt`                                                                               | [Date](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Date) | :heavy_check_mark:                                                                            | N/A                                                                                           |