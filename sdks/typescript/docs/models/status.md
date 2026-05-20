# Status

## Example Usage

```typescript
import { Status } from "@mailmon.dev/sdk/models";

let value: Status = "failed";

// Open enum: unrecognized values are captured as Unrecognized<string>
```

## Values

```typescript
"queued" | "running" | "completed" | "failed" | "cancelled" | Unrecognized<string>;
```
