# lease-loss-prevents-stale-commit

## Evidence Trail

- Core path: `runAcquiredMailboxSyncExecution` races sync work against heartbeat renewal and maps failed renewal to `mailbox_sync_lease_lost`.
- DB path: `applyMailboxSyncCommit` calls `guardActiveLease` before writing messages, threads, events, sync run completion, or cursor.
- Persistence layer returns `applied: false` when the lease owner is wrong or expired.
- Existing examples check lease loss, but not generated stale-owner/timestamp combinations.

## Failure Scenario

Generate current lease owner, commit owner, heartbeat timestamp, expiration timestamp, and snapshot. A stale owner or expired lease must not modify durable state.

## PBT Implementation Notes

Use Hegel to generate lease states and snapshots. In DB-backed tests, seed a mailbox and active sync run, optionally mutate the active lease before calling `MailboxStateStore.applySyncResult`, then compare rows before and after.

## SUT-Side Instrumentation

Missing. Future `Always` assertion point: immediately after `applySyncResult` returns `applied: false`, assert no mailbox event IDs were returned and stored cursor did not change.

## Open Questions

- None
