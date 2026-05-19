# DeliveryState

## Example Usage

```typescript
import { DeliveryState } from "@mailmon.dev/sdk/models";

let value: DeliveryState = "failing";

// Open enum: unrecognized values are captured as Unrecognized<string>
```

## Values

```typescript
"healthy" | "degraded" | "failing" | Unrecognized<string>
```