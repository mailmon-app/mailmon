# GetV1MailboxesByMailboxIdSyncRunsStatus

## Example Usage

```typescript
import { GetV1MailboxesByMailboxIdSyncRunsStatus } from "@mailmon.dev/sdk/models/operations";

let value: GetV1MailboxesByMailboxIdSyncRunsStatus =
  "failed_after_lease_acquired";

// Open enum: unrecognized values are captured as Unrecognized<string>
```

## Values

```typescript
"running" | "completed" | "skipped_due_to_active_lease" | "reconnect_required" | "dispatch_retry_exhausted" | "failed_after_lease_acquired" | "lease_lost" | Unrecognized<string>
```