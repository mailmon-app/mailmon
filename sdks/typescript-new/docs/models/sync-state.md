# SyncState

## Example Usage

```typescript
import { SyncState } from "@mailmon.dev/sdk/models";

let value: SyncState = "healthy";

// Open enum: unrecognized values are captured as Unrecognized<string>
```

## Values

```typescript
"initializing" | "healthy" | "lagging" | "failed" | Unrecognized<string>;
```
