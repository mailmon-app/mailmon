# GetV1ThreadsByThreadIdResponse

Thread

## Example Usage

```typescript
import { GetV1ThreadsByThreadIdResponse } from "@mailmon.dev/sdk/models/operations";

let value: GetV1ThreadsByThreadIdResponse = {
  id: "<id>",
  object: "thread",
  mailboxId: "<id>",
  providerThreadId: "<id>",
  subject: "<value>",
  lastMessageAt: new Date("2024-05-30T16:50:58.897Z"),
  messages: [],
};
```

## Fields

| Field                                                                                                    | Type                                                                                                     | Required                                                                                                 | Description                                                                                              |
| -------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `id`                                                                                                     | *string*                                                                                                 | :heavy_check_mark:                                                                                       | N/A                                                                                                      |
| `object`                                                                                                 | [operations.GetV1ThreadsByThreadIdObject](../../models/operations/get-v1-threads-by-thread-id-object.md) | :heavy_check_mark:                                                                                       | N/A                                                                                                      |
| `mailboxId`                                                                                              | *string*                                                                                                 | :heavy_check_mark:                                                                                       | N/A                                                                                                      |
| `providerThreadId`                                                                                       | *string*                                                                                                 | :heavy_check_mark:                                                                                       | N/A                                                                                                      |
| `subject`                                                                                                | *string*                                                                                                 | :heavy_check_mark:                                                                                       | N/A                                                                                                      |
| `lastMessageAt`                                                                                          | [Date](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Date)            | :heavy_check_mark:                                                                                       | N/A                                                                                                      |
| `messages`                                                                                               | [operations.Message](../../models/operations/message.md)[]                                               | :heavy_check_mark:                                                                                       | N/A                                                                                                      |