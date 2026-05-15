# mailbox-lease-single-flight

## Evidence Trail

- Claimed guarantee: README and PRD say one active sync per mailbox and queue ordering is not trusted.
- Core path: `packages/core/src/mailbox-sync-execution.ts` starts a sync run, acquires a mailbox lease, and skips when acquisition fails.
- DB path: `packages/db/src/persistence/mailbox-sync-coordinator.ts` updates `mailboxes.activeSyncLease*` only when the existing lease is null or expired.
- Existing tests cover fixed lease contention examples in `packages/core/src/use-cases.test.ts`, but not generated concurrent schedules.

## Failure Scenario

Generate N concurrent sync attempts for one mailbox with varied provider delays and lease acquisition timing. A failure occurs if more than one attempt applies state, if a skipped attempt advances cursor, or if skipped attempts emit mailbox events.

## PBT Implementation Notes

Use Hegel `testAsync` with generated worker counts, mailbox IDs, delay schedules, and provider snapshots. Start with an in-memory core-service model for fast shrinking, then add a DB-backed variant using the existing isolated database harness.

## SUT-Side Instrumentation

Missing. If Antithesis access exists later, add `Always` assertions around sync completion summaries: one applied sync per mailbox lease interval, skipped runs have zero events and null next cursor.

## Open Questions

- None
