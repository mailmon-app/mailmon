# Cursor

## Example Usage

```typescript
import { Cursor } from "@mailmon.dev/sdk/models";

let value: Cursor = {
  currentCursor: "<value>",
  previousCursor: "<value>",
  nextCursor: "<value>",
  advanced: true,
  advancedAt: new Date("2025-12-19T10:02:36.800Z"),
};
```

## Fields

| Field            | Type                                                                                          | Required           | Description |
| ---------------- | --------------------------------------------------------------------------------------------- | ------------------ | ----------- |
| `currentCursor`  | _string_                                                                                      | :heavy_check_mark: | N/A         |
| `previousCursor` | _string_                                                                                      | :heavy_check_mark: | N/A         |
| `nextCursor`     | _string_                                                                                      | :heavy_check_mark: | N/A         |
| `advanced`       | _boolean_                                                                                     | :heavy_check_mark: | N/A         |
| `advancedAt`     | [Date](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Date) | :heavy_check_mark: | N/A         |
