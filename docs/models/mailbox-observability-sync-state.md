# MailboxObservabilitySyncState

## Example Usage

```typescript
import { MailboxObservabilitySyncState } from "@mailmon.dev/sdk/models";

let value: MailboxObservabilitySyncState = "initializing";

// Open enum: unrecognized values are captured as Unrecognized<string>
```

## Values

```typescript
"initializing" | "healthy" | "lagging" | "failed" | Unrecognized<string>
```