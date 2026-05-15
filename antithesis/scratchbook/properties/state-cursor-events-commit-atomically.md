# state-cursor-events-commit-atomically

## Evidence Trail

- `MailboxStateStore.applySyncResult` wraps `applyMailboxSyncCommit` in one DB transaction.
- `applyMailboxSyncCommit` applies threads, messages, deletions, recalculated thread summaries, event inserts, mailbox cursor update, and sync run completion before returning.
- `finalizeMailboxSyncCommit` writes mailbox cursor and sync run status inside the same transaction.

## Failure Scenario

Generate snapshots with creates, updates, deletions, and next cursors. After a successful commit, all state surfaces must agree: mailbox cursor, sync run cursor/count, canonical rows, and mailbox events. Failed commits must not leave partial rows.

## PBT Implementation Notes

Use Hegel to generate valid canonical snapshots constrained to consistent message/thread IDs. Run against PostgreSQL with isolated databases. Compare derived expected state to actual rows.

## SUT-Side Instrumentation

Missing. Future `Always` assertion point: after commit, assert emitted event count equals persisted event count and sync run `eventsEmitted`.

## Open Questions

- None
