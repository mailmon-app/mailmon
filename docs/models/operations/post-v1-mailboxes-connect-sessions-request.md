# PostV1MailboxesConnectSessionsRequest

## Example Usage

```typescript
import { PostV1MailboxesConnectSessionsRequest } from "@mailmon.dev/sdk/models/operations";

let value: PostV1MailboxesConnectSessionsRequest = {
  provider: "gmail",
  tenantExternalId: "<id>",
  mailboxExternalId: "<id>",
  redirectUrl: "https://stiff-hunt.net",
};
```

## Fields

| Field                 | Type                  | Required              | Description           |
| --------------------- | --------------------- | --------------------- | --------------------- |
| `provider`            | *operations.Provider* | :heavy_check_mark:    | N/A                   |
| `tenantExternalId`    | *string*              | :heavy_check_mark:    | N/A                   |
| `mailboxExternalId`   | *string*              | :heavy_check_mark:    | N/A                   |
| `redirectUrl`         | *string*              | :heavy_check_mark:    | N/A                   |