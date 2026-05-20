# WebhookEndpoint

## Example Usage

```typescript
import { WebhookEndpoint } from "@mailmon.dev/sdk/models";

let value: WebhookEndpoint = {
  id: "<id>",
  object: "webhook_endpoint",
  url: "https://stiff-retention.info",
  description: "iridescence during shush psst yet",
  deliveryState: "healthy",
  lastDeliveryAt: new Date("2026-09-06T08:39:24.871Z"),
  lastDeliveryError: {
    code: "<value>",
    message: "<value>",
    occurredAt: new Date("2026-04-12T16:21:36.709Z"),
    retryable: false,
  },
  createdAt: new Date("2024-06-10T03:40:43.832Z"),
  secret: "<value>",
};
```

## Fields

| Field                                                                                         | Type                                                                                          | Required                                                                                      | Description                                                                                   |
| --------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `id`                                                                                          | *string*                                                                                      | :heavy_check_mark:                                                                            | N/A                                                                                           |
| `object`                                                                                      | [models.WebhookEndpointObject](../models/webhook-endpoint-object.md)                          | :heavy_check_mark:                                                                            | N/A                                                                                           |
| `url`                                                                                         | *string*                                                                                      | :heavy_check_mark:                                                                            | N/A                                                                                           |
| `description`                                                                                 | *string*                                                                                      | :heavy_check_mark:                                                                            | N/A                                                                                           |
| `deliveryState`                                                                               | [models.WebhookEndpointDeliveryState](../models/webhook-endpoint-delivery-state.md)           | :heavy_check_mark:                                                                            | N/A                                                                                           |
| `lastDeliveryAt`                                                                              | [Date](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Date) | :heavy_check_mark:                                                                            | N/A                                                                                           |
| `lastDeliveryError`                                                                           | [models.WebhookEndpointLastDeliveryError](../models/webhook-endpoint-last-delivery-error.md)  | :heavy_check_mark:                                                                            | N/A                                                                                           |
| `createdAt`                                                                                   | [Date](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Date) | :heavy_check_mark:                                                                            | N/A                                                                                           |
| `secret`                                                                                      | *string*                                                                                      | :heavy_check_mark:                                                                            | N/A                                                                                           |