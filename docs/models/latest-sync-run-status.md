# LatestSyncRunStatus

## Example Usage

```typescript
import { LatestSyncRunStatus } from "@mailmon.dev/sdk/models";

let value: LatestSyncRunStatus = "reconnect_required";

// Open enum: unrecognized values are captured as Unrecognized<string>
```

## Values

```typescript
"running" | "completed" | "skipped_due_to_active_lease" | "reconnect_required" | "dispatch_retry_exhausted" | "failed_after_lease_acquired" | "lease_lost" | Unrecognized<string>
```