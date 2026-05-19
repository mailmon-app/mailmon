# PostV1WebhookEndpointsByEndpointIdSubscriptionsRequestBody

## Example Usage

```typescript
import { PostV1WebhookEndpointsByEndpointIdSubscriptionsRequestBody } from "@mailmon.dev/sdk/models/operations";

let value: PostV1WebhookEndpointsByEndpointIdSubscriptionsRequestBody = {
  mailboxIds: [],
  eventTypes: [
    "message.created",
  ],
};
```

## Fields

| Field                    | Type                     | Required                 | Description              |
| ------------------------ | ------------------------ | ------------------------ | ------------------------ |
| `mailboxIds`             | *operations.MailboxId*[] | :heavy_check_mark:       | N/A                      |
| `eventTypes`             | *operations.EventType*[] | :heavy_check_mark:       | N/A                      |