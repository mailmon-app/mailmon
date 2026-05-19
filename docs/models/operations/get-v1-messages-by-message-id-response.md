# GetV1MessagesByMessageIdResponse

Message

## Example Usage

```typescript
import { GetV1MessagesByMessageIdResponse } from "@mailmon.dev/sdk/models/operations";

let value: GetV1MessagesByMessageIdResponse = {
  id: "<id>",
  mailboxId: "<id>",
  threadId: "<id>",
  providerMessageId: "<id>",
  subject: "<value>",
  from: {
    name: "<value>",
    email: "Colleen.Fisher@hotmail.com",
  },
  snippet: "<value>",
  receivedAt: new Date("2025-08-07T11:27:31.548Z"),
  labelIds: [
    "<value 1>",
    "<value 2>",
  ],
};
```

## Fields

| Field                                                                                                    | Type                                                                                                     | Required                                                                                                 | Description                                                                                              |
| -------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `id`                                                                                                     | *string*                                                                                                 | :heavy_check_mark:                                                                                       | N/A                                                                                                      |
| `mailboxId`                                                                                              | *string*                                                                                                 | :heavy_check_mark:                                                                                       | N/A                                                                                                      |
| `threadId`                                                                                               | *string*                                                                                                 | :heavy_check_mark:                                                                                       | N/A                                                                                                      |
| `providerMessageId`                                                                                      | *string*                                                                                                 | :heavy_check_mark:                                                                                       | N/A                                                                                                      |
| `subject`                                                                                                | *string*                                                                                                 | :heavy_check_mark:                                                                                       | N/A                                                                                                      |
| `from`                                                                                                   | [operations.GetV1MessagesByMessageIdFrom](../../models/operations/get-v1-messages-by-message-id-from.md) | :heavy_check_mark:                                                                                       | N/A                                                                                                      |
| `snippet`                                                                                                | *string*                                                                                                 | :heavy_check_mark:                                                                                       | N/A                                                                                                      |
| `receivedAt`                                                                                             | [Date](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Date)            | :heavy_check_mark:                                                                                       | N/A                                                                                                      |
| `labelIds`                                                                                               | *string*[]                                                                                               | :heavy_check_mark:                                                                                       | N/A                                                                                                      |