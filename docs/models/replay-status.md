# ReplayStatus

## Example Usage

```typescript
import { ReplayStatus } from "@mailmon.dev/sdk/models";

let value: ReplayStatus = "running";

// Open enum: unrecognized values are captured as Unrecognized<string>
```

## Values

```typescript
"queued" | "running" | "completed" | "failed" | "cancelled" | Unrecognized<string>
```