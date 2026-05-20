# CreateWebhookEndpointSubscriptionRequest

## Example Usage

```typescript
import { CreateWebhookEndpointSubscriptionRequest } from "@mailmon.dev/sdk/models";

let value: CreateWebhookEndpointSubscriptionRequest = {
  mailboxIds: [
    "<value 1>",
    "<value 2>",
    "<value 3>",
  ],
  eventTypes: [
    "message.created",
  ],
};
```

## Fields

| Field                                                                                                                              | Type                                                                                                                               | Required                                                                                                                           | Description                                                                                                                        |
| ---------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `mailboxIds`                                                                                                                       | *string*[]                                                                                                                         | :heavy_check_mark:                                                                                                                 | N/A                                                                                                                                |
| `eventTypes`                                                                                                                       | [models.CreateWebhookEndpointSubscriptionRequestEventType](../models/create-webhook-endpoint-subscription-request-event-type.md)[] | :heavy_check_mark:                                                                                                                 | N/A                                                                                                                                |