# CreateConnectSessionRequest

## Example Usage

```typescript
import { CreateConnectSessionRequest } from "@mailmon.dev/sdk/models";

let value: CreateConnectSessionRequest = {
  provider: "gmail",
  tenantExternalId: "<id>",
  mailboxExternalId: "<id>",
  redirectUrl: "https://possible-popularity.org",
};
```

## Fields

| Field                                                                                              | Type                                                                                               | Required                                                                                           | Description                                                                                        |
| -------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `provider`                                                                                         | [models.CreateConnectSessionRequestProvider](../models/create-connect-session-request-provider.md) | :heavy_check_mark:                                                                                 | N/A                                                                                                |
| `tenantExternalId`                                                                                 | *string*                                                                                           | :heavy_check_mark:                                                                                 | N/A                                                                                                |
| `mailboxExternalId`                                                                                | *string*                                                                                           | :heavy_check_mark:                                                                                 | N/A                                                                                                |
| `redirectUrl`                                                                                      | *string*                                                                                           | :heavy_check_mark:                                                                                 | N/A                                                                                                |