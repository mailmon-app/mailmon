# WebhookEndpointSubscriptionList

## Example Usage

```typescript
import { WebhookEndpointSubscriptionList } from "@mailmon.dev/sdk/models";

let value: WebhookEndpointSubscriptionList = {
  object: "list",
  data: [
    {
      id: "<id>",
      object: "webhook_endpoint_subscription",
      webhookEndpointId: "<id>",
      mailboxId: "<id>",
      eventTypes: [
        "thread.updated",
      ],
      createdAt: new Date("2026-02-24T17:06:44.970Z"),
    },
  ],
  nextCursor: "<value>",
};
```

## Fields

| Field                                                                                                           | Type                                                                                                            | Required                                                                                                        | Description                                                                                                     |
| --------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `object`                                                                                                        | [models.WebhookEndpointSubscriptionListObjectList](../models/webhook-endpoint-subscription-list-object-list.md) | :heavy_check_mark:                                                                                              | N/A                                                                                                             |
| `data`                                                                                                          | [models.WebhookEndpointSubscriptionListData](../models/webhook-endpoint-subscription-list-data.md)[]            | :heavy_check_mark:                                                                                              | N/A                                                                                                             |
| `nextCursor`                                                                                                    | *string*                                                                                                        | :heavy_check_mark:                                                                                              | N/A                                                                                                             |