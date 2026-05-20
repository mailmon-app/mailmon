# WebhookEndpointSubscriptionListData

## Example Usage

```typescript
import { WebhookEndpointSubscriptionListData } from "@mailmon.dev/sdk/models";

let value: WebhookEndpointSubscriptionListData = {
  id: "<id>",
  object: "webhook_endpoint_subscription",
  webhookEndpointId: "<id>",
  mailboxId: "<id>",
  eventTypes: [],
  createdAt: new Date("2026-02-15T03:28:45.935Z"),
};
```

## Fields

| Field                                                                                         | Type                                                                                          | Required                                                                                      | Description                                                                                   |
| --------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `id`                                                                                          | *string*                                                                                      | :heavy_check_mark:                                                                            | N/A                                                                                           |
| `object`                                                                                      | [models.ObjectWebhookEndpointSubscription](../models/object-webhook-endpoint-subscription.md) | :heavy_check_mark:                                                                            | N/A                                                                                           |
| `webhookEndpointId`                                                                           | *string*                                                                                      | :heavy_check_mark:                                                                            | N/A                                                                                           |
| `mailboxId`                                                                                   | *string*                                                                                      | :heavy_check_mark:                                                                            | N/A                                                                                           |
| `eventTypes`                                                                                  | [models.WebhookEventType](../models/webhook-event-type.md)[]                                  | :heavy_check_mark:                                                                            | N/A                                                                                           |
| `createdAt`                                                                                   | [Date](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Date) | :heavy_check_mark:                                                                            | N/A                                                                                           |