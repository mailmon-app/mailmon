# PostV1WebhookEndpointsByEndpointIdSubscriptionsRequest

## Example Usage

```typescript
import { PostV1WebhookEndpointsByEndpointIdSubscriptionsRequest } from "@mailmon.dev/sdk/models/operations";

let value: PostV1WebhookEndpointsByEndpointIdSubscriptionsRequest = {
  endpointId: "<id>",
  body: {
    mailboxIds: [],
    eventTypes: [
      "message.updated",
    ],
  },
};
```

## Fields

| Field                                                                                                                                                                   | Type                                                                                                                                                                    | Required                                                                                                                                                                | Description                                                                                                                                                             |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `endpointId`                                                                                                                                                            | *string*                                                                                                                                                                | :heavy_check_mark:                                                                                                                                                      | N/A                                                                                                                                                                     |
| `body`                                                                                                                                                                  | [operations.PostV1WebhookEndpointsByEndpointIdSubscriptionsRequestBody](../../models/operations/post-v1-webhook-endpoints-by-endpoint-id-subscriptions-request-body.md) | :heavy_check_mark:                                                                                                                                                      | N/A                                                                                                                                                                     |