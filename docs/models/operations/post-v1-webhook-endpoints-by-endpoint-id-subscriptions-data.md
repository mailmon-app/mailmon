# PostV1WebhookEndpointsByEndpointIdSubscriptionsData

## Example Usage

```typescript
import { PostV1WebhookEndpointsByEndpointIdSubscriptionsData } from "@mailmon.dev/sdk/models/operations";

let value: PostV1WebhookEndpointsByEndpointIdSubscriptionsData = {
  id: "<id>",
  object: "webhook_endpoint_subscription",
  webhookEndpointId: "<id>",
  mailboxId: "<id>",
  eventTypes: [],
  createdAt: new Date("2025-10-20T13:11:47.257Z"),
};
```

## Fields

| Field                                                                                                           | Type                                                                                                            | Required                                                                                                        | Description                                                                                                     |
| --------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `id`                                                                                                            | *string*                                                                                                        | :heavy_check_mark:                                                                                              | N/A                                                                                                             |
| `object`                                                                                                        | [operations.ObjectWebhookEndpointSubscription](../../models/operations/object-webhook-endpoint-subscription.md) | :heavy_check_mark:                                                                                              | N/A                                                                                                             |
| `webhookEndpointId`                                                                                             | *string*                                                                                                        | :heavy_check_mark:                                                                                              | N/A                                                                                                             |
| `mailboxId`                                                                                                     | *string*                                                                                                        | :heavy_check_mark:                                                                                              | N/A                                                                                                             |
| `eventTypes`                                                                                                    | [models.WebhookEventType](../../models/webhook-event-type.md)[]                                                 | :heavy_check_mark:                                                                                              | N/A                                                                                                             |
| `createdAt`                                                                                                     | [Date](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Date)                   | :heavy_check_mark:                                                                                              | N/A                                                                                                             |