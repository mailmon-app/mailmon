# ThreadList

## Example Usage

```typescript
import { ThreadList } from "@mailmon.dev/sdk/models";

let value: ThreadList = {
  object: "list",
  data: [],
  nextCursor: "<value>",
};
```

## Fields

| Field                                                               | Type                                                                | Required                                                            | Description                                                         |
| ------------------------------------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------- |
| `object`                                                            | [models.ThreadListObjectList](../models/thread-list-object-list.md) | :heavy_check_mark:                                                  | N/A                                                                 |
| `data`                                                              | [models.ThreadListData](../models/thread-list-data.md)[]            | :heavy_check_mark:                                                  | N/A                                                                 |
| `nextCursor`                                                        | *string*                                                            | :heavy_check_mark:                                                  | N/A                                                                 |