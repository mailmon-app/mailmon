# PostV1WebhookEndpointsResponse

Webhook endpoint created

## Example Usage

```typescript
import { PostV1WebhookEndpointsResponse } from "@mailmon.dev/sdk/models/operations";

let value: PostV1WebhookEndpointsResponse = {
  id: "<id>",
  object: "webhook_endpoint",
  url: "https://gentle-cardboard.name/",
  description: "jury woot upliftingly yuck ideal outlaw",
  deliveryState: "healthy",
  lastDeliveryAt: null,
  lastDeliveryError: {
    code: "<value>",
    message: "<value>",
    occurredAt: new Date("2025-12-14T10:34:26.502Z"),
    retryable: false,
  },
  createdAt: new Date("2026-04-02T13:16:13.026Z"),
  secret: "<value>",
};
```

## Fields

| Field                                                                                                                          | Type                                                                                                                           | Required                                                                                                                       | Description                                                                                                                    |
| ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| `id`                                                                                                                           | *string*                                                                                                                       | :heavy_check_mark:                                                                                                             | N/A                                                                                                                            |
| `object`                                                                                                                       | [operations.PostV1WebhookEndpointsObject](../../models/operations/post-v1-webhook-endpoints-object.md)                         | :heavy_check_mark:                                                                                                             | N/A                                                                                                                            |
| `url`                                                                                                                          | *string*                                                                                                                       | :heavy_check_mark:                                                                                                             | N/A                                                                                                                            |
| `description`                                                                                                                  | *string*                                                                                                                       | :heavy_check_mark:                                                                                                             | N/A                                                                                                                            |
| `deliveryState`                                                                                                                | [operations.PostV1WebhookEndpointsDeliveryState](../../models/operations/post-v1-webhook-endpoints-delivery-state.md)          | :heavy_check_mark:                                                                                                             | N/A                                                                                                                            |
| `lastDeliveryAt`                                                                                                               | [Date](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Date)                                  | :heavy_check_mark:                                                                                                             | N/A                                                                                                                            |
| `lastDeliveryError`                                                                                                            | [operations.PostV1WebhookEndpointsLastDeliveryError](../../models/operations/post-v1-webhook-endpoints-last-delivery-error.md) | :heavy_check_mark:                                                                                                             | N/A                                                                                                                            |
| `createdAt`                                                                                                                    | [Date](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Date)                                  | :heavy_check_mark:                                                                                                             | N/A                                                                                                                            |
| `secret`                                                                                                                       | *string*                                                                                                                       | :heavy_check_mark:                                                                                                             | N/A                                                                                                                            |