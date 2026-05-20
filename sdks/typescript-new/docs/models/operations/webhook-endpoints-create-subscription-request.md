# WebhookEndpointsCreateSubscriptionRequest

## Example Usage

```typescript
import { WebhookEndpointsCreateSubscriptionRequest } from "@mailmon.dev/sdk/models/operations";

let value: WebhookEndpointsCreateSubscriptionRequest = {
  endpointId: "<id>",
  body: {
    mailboxIds: ["<value 1>"],
    eventTypes: ["message.created"],
  },
};
```

## Fields

| Field        | Type                                                                                                            | Required           | Description |
| ------------ | --------------------------------------------------------------------------------------------------------------- | ------------------ | ----------- |
| `endpointId` | _string_                                                                                                        | :heavy_check_mark: | N/A         |
| `body`       | [models.CreateWebhookEndpointSubscriptionRequest](../../models/create-webhook-endpoint-subscription-request.md) | :heavy_check_mark: | N/A         |
