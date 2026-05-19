# WebhookDelivery

## Example Usage

```typescript
import { WebhookDelivery } from "@mailmon.dev/sdk/models/operations";

let value: WebhookDelivery = {
  webhookEndpointId: "<id>",
  webhookEndpointUrl: "https://necessary-aircraft.com",
  deliveryState: "healthy",
  consecutiveFailures: 612262,
  pendingDeliveries: 750835,
  processingDeliveries: 64016,
  failedDeliveries: 35737,
  lastDeliveryAt: new Date("2024-07-28T17:12:25.008Z"),
  lastDeliveryError: null,
};
```

## Fields

| Field                                                                                         | Type                                                                                          | Required                                                                                      | Description                                                                                   |
| --------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `webhookEndpointId`                                                                           | *string*                                                                                      | :heavy_check_mark:                                                                            | N/A                                                                                           |
| `webhookEndpointUrl`                                                                          | *string*                                                                                      | :heavy_check_mark:                                                                            | N/A                                                                                           |
| `deliveryState`                                                                               | [models.DeliveryState](../../models/delivery-state.md)                                        | :heavy_check_mark:                                                                            | N/A                                                                                           |
| `consecutiveFailures`                                                                         | *number*                                                                                      | :heavy_check_mark:                                                                            | N/A                                                                                           |
| `pendingDeliveries`                                                                           | *number*                                                                                      | :heavy_check_mark:                                                                            | N/A                                                                                           |
| `processingDeliveries`                                                                        | *number*                                                                                      | :heavy_check_mark:                                                                            | N/A                                                                                           |
| `failedDeliveries`                                                                            | *number*                                                                                      | :heavy_check_mark:                                                                            | N/A                                                                                           |
| `lastDeliveryAt`                                                                              | [Date](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Date) | :heavy_check_mark:                                                                            | N/A                                                                                           |
| `lastDeliveryError`                                                                           | [models.ErrorDetail](../../models/error-detail.md)                                            | :heavy_check_mark:                                                                            | N/A                                                                                           |