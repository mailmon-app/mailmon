# MailboxObservabilityLastDeliveryError

## Example Usage

```typescript
import { MailboxObservabilityLastDeliveryError } from "@mailmon.dev/sdk/models";

let value: MailboxObservabilityLastDeliveryError = {
  code: "<value>",
  message: "<value>",
  occurredAt: new Date("2024-06-13T10:01:30.919Z"),
  retryable: true,
};
```

## Fields

| Field                                                                                         | Type                                                                                          | Required                                                                                      | Description                                                                                   |
| --------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `code`                                                                                        | *string*                                                                                      | :heavy_check_mark:                                                                            | N/A                                                                                           |
| `message`                                                                                     | *string*                                                                                      | :heavy_check_mark:                                                                            | N/A                                                                                           |
| `occurredAt`                                                                                  | [Date](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Date) | :heavy_check_mark:                                                                            | N/A                                                                                           |
| `retryable`                                                                                   | *boolean*                                                                                     | :heavy_check_mark:                                                                            | N/A                                                                                           |