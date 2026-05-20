# ConnectSession

## Example Usage

```typescript
import { ConnectSession } from "@mailmon.dev/sdk/models";

let value: ConnectSession = {
  id: "<id>",
  object: "connect_session",
  connectUrl: "https://metallic-adviser.biz",
  expiresAt: new Date("2024-10-16T13:34:14.663Z"),
};
```

## Fields

| Field        | Type                                                                                          | Required           | Description |
| ------------ | --------------------------------------------------------------------------------------------- | ------------------ | ----------- |
| `id`         | _string_                                                                                      | :heavy_check_mark: | N/A         |
| `object`     | [models.ConnectSessionObject](../models/connect-session-object.md)                            | :heavy_check_mark: | N/A         |
| `connectUrl` | _string_                                                                                      | :heavy_check_mark: | N/A         |
| `expiresAt`  | [Date](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Date) | :heavy_check_mark: | N/A         |
