# PostV1WebhookEndpointsByEndpointIdSubscriptionsResponse

Webhook subscriptions created

## Example Usage

```typescript
import { PostV1WebhookEndpointsByEndpointIdSubscriptionsResponse } from "@mailmon.dev/sdk/models/operations";

let value: PostV1WebhookEndpointsByEndpointIdSubscriptionsResponse = {
  object: "list",
  data: [],
  nextCursor: null,
};
```

## Fields

| Field                                                                                                                                                        | Type                                                                                                                                                         | Required                                                                                                                                                     | Description                                                                                                                                                  |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `object`                                                                                                                                                     | [operations.PostV1WebhookEndpointsByEndpointIdSubscriptionsObject](../../models/operations/post-v1-webhook-endpoints-by-endpoint-id-subscriptions-object.md) | :heavy_check_mark:                                                                                                                                           | N/A                                                                                                                                                          |
| `data`                                                                                                                                                       | [operations.PostV1WebhookEndpointsByEndpointIdSubscriptionsData](../../models/operations/post-v1-webhook-endpoints-by-endpoint-id-subscriptions-data.md)[]   | :heavy_check_mark:                                                                                                                                           | N/A                                                                                                                                                          |
| `nextCursor`                                                                                                                                                 | *string*                                                                                                                                                     | :heavy_check_mark:                                                                                                                                           | N/A                                                                                                                                                          |