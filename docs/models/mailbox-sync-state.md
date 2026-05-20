# MailboxSyncState

## Example Usage

```typescript
import { MailboxSyncState } from "@mailmon.dev/sdk/models";

let value: MailboxSyncState = "failed";

// Open enum: unrecognized values are captured as Unrecognized<string>
```

## Values

```typescript
"initializing" | "healthy" | "lagging" | "failed" | Unrecognized<string>
```