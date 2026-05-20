# CreateWebhookEndpointSubscriptionRequest

## Example Usage

```typescript
import { CreateWebhookEndpointSubscriptionRequest } from "@mailmon.dev/sdk/models";

let value: CreateWebhookEndpointSubscriptionRequest = {
  mailboxIds: ["<value 1>", "<value 2>", "<value 3>"],
  eventTypes: ["message.created"],
};
```

## Fields

| Field        | Type                                                         | Required           | Description |
| ------------ | ------------------------------------------------------------ | ------------------ | ----------- |
| `mailboxIds` | _string_[]                                                   | :heavy_check_mark: | N/A         |
| `eventTypes` | [models.WebhookEventType](../models/webhook-event-type.md)[] | :heavy_check_mark: | N/A         |
