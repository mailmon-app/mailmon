# ThreadsListResponse

## Example Usage

```typescript
import { ThreadsListResponse } from "@mailmon.dev/sdk/models/operations";

let value: ThreadsListResponse = {
  result: {
    object: "list",
    data: [],
    nextCursor: "<value>",
  },
};
```

## Fields

| Field                                            | Type                                             | Required                                         | Description                                      |
| ------------------------------------------------ | ------------------------------------------------ | ------------------------------------------------ | ------------------------------------------------ |
| `result`                                         | [models.ThreadList](../../models/thread-list.md) | :heavy_check_mark:                               | N/A                                              |