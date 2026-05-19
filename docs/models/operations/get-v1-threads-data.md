# GetV1ThreadsData

## Example Usage

```typescript
import { GetV1ThreadsData } from "@mailmon.dev/sdk/models/operations";

let value: GetV1ThreadsData = {
  id: "<id>",
  object: "thread",
  mailboxId: "<id>",
  providerThreadId: "<id>",
  subject: "<value>",
  lastMessageAt: new Date("2024-07-19T10:37:06.832Z"),
};
```

## Fields

| Field                                                                                          | Type                                                                                           | Required                                                                                       | Description                                                                                    |
| ---------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `id`                                                                                           | *string*                                                                                       | :heavy_check_mark:                                                                             | N/A                                                                                            |
| `object`                                                                                       | [operations.GetV1ThreadsObjectThread](../../models/operations/get-v1-threads-object-thread.md) | :heavy_check_mark:                                                                             | N/A                                                                                            |
| `mailboxId`                                                                                    | *string*                                                                                       | :heavy_check_mark:                                                                             | N/A                                                                                            |
| `providerThreadId`                                                                             | *string*                                                                                       | :heavy_check_mark:                                                                             | N/A                                                                                            |
| `subject`                                                                                      | *string*                                                                                       | :heavy_check_mark:                                                                             | N/A                                                                                            |
| `lastMessageAt`                                                                                | [Date](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Date)  | :heavy_check_mark:                                                                             | N/A                                                                                            |