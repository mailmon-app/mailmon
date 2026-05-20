# MailboxWatchState

## Example Usage

```typescript
import { MailboxWatchState } from "@mailmon.dev/sdk/models";

let value: MailboxWatchState = "active";

// Open enum: unrecognized values are captured as Unrecognized<string>
```

## Values

```typescript
"active" | "expiring" | "expired" | "unhealthy" | Unrecognized<string>
```