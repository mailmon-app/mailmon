# WatchState

## Example Usage

```typescript
import { WatchState } from "@mailmon.dev/sdk/models";

let value: WatchState = "expired";

// Open enum: unrecognized values are captured as Unrecognized<string>
```

## Values

```typescript
"active" | "expiring" | "expired" | "unhealthy" | Unrecognized<string>;
```
