# ThreadMessage

## Example Usage

```typescript
import { ThreadMessage } from "@mailmon.dev/sdk/models";

let value: ThreadMessage = {
  id: "<id>",
  subject: "<value>",
  receivedAt: new Date("2024-12-29T13:27:45.100Z"),
};
```

## Fields

| Field        | Type                                                                                          | Required           | Description |
| ------------ | --------------------------------------------------------------------------------------------- | ------------------ | ----------- |
| `id`         | _string_                                                                                      | :heavy_check_mark: | N/A         |
| `subject`    | _string_                                                                                      | :heavy_check_mark: | N/A         |
| `receivedAt` | [Date](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Date) | :heavy_check_mark: | N/A         |
