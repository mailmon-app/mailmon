# PostV1MailboxesConnectSessionsResponse

Connect session created

## Example Usage

```typescript
import { PostV1MailboxesConnectSessionsResponse } from "@mailmon.dev/sdk/models/operations";

let value: PostV1MailboxesConnectSessionsResponse = {
  id: "<id>",
  object: "connect_session",
  connectUrl: "https://weary-custom.net",
  expiresAt: new Date("2024-09-12T22:41:21.399Z"),
};
```

## Fields

| Field                                                                                                                   | Type                                                                                                                    | Required                                                                                                                | Description                                                                                                             |
| ----------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `id`                                                                                                                    | *string*                                                                                                                | :heavy_check_mark:                                                                                                      | N/A                                                                                                                     |
| `object`                                                                                                                | [operations.PostV1MailboxesConnectSessionsObject](../../models/operations/post-v1-mailboxes-connect-sessions-object.md) | :heavy_check_mark:                                                                                                      | N/A                                                                                                                     |
| `connectUrl`                                                                                                            | *string*                                                                                                                | :heavy_check_mark:                                                                                                      | N/A                                                                                                                     |
| `expiresAt`                                                                                                             | [Date](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Date)                           | :heavy_check_mark:                                                                                                      | N/A                                                                                                                     |