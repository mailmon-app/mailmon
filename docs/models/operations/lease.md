# Lease

## Example Usage

```typescript
import { Lease } from "@mailmon.dev/sdk/models/operations";

let value: Lease = {
  activeLeaseOwner: "<value>",
  activeLeaseHeartbeatAt: new Date("2025-02-04T06:29:01.550Z"),
  activeLeaseExpiresAt: new Date("2025-03-26T22:06:18.660Z"),
  contentionCount24h: 286105,
  latestContentionAt: new Date("2025-11-16T15:01:20.880Z"),
  leaseLossCount24h: 46124,
  latestLeaseLossAt: new Date("2026-03-03T21:08:10.094Z"),
};
```

## Fields

| Field                                                                                         | Type                                                                                          | Required                                                                                      | Description                                                                                   |
| --------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `activeLeaseOwner`                                                                            | *string*                                                                                      | :heavy_check_mark:                                                                            | N/A                                                                                           |
| `activeLeaseHeartbeatAt`                                                                      | [Date](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Date) | :heavy_check_mark:                                                                            | N/A                                                                                           |
| `activeLeaseExpiresAt`                                                                        | [Date](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Date) | :heavy_check_mark:                                                                            | N/A                                                                                           |
| `contentionCount24h`                                                                          | *number*                                                                                      | :heavy_check_mark:                                                                            | N/A                                                                                           |
| `latestContentionAt`                                                                          | [Date](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Date) | :heavy_check_mark:                                                                            | N/A                                                                                           |
| `leaseLossCount24h`                                                                           | *number*                                                                                      | :heavy_check_mark:                                                                            | N/A                                                                                           |
| `latestLeaseLossAt`                                                                           | [Date](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Date) | :heavy_check_mark:                                                                            | N/A                                                                                           |