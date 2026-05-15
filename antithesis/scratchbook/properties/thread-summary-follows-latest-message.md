# thread-summary-follows-latest-message

## Evidence Trail

- `toSyncSnapshot` derives thread summaries from the latest generated canonical message per provider thread.
- DB commit recalculates affected threads from persisted messages after applying deletes.
- Existing `packages/db/src/mailbox-event-emission.test.ts` includes a fixed regression around deleting the newest message, but not generated thread shapes.

## Failure Scenario

Generate messages grouped by provider thread and deletion sets. After commit, each stored thread summary must reflect the latest remaining message for that provider thread.

## PBT Implementation Notes

Use Hegel to generate several provider threads, messages with received timestamps, and delete operations. Apply baseline then delete-only snapshots in PostgreSQL and compare thread rows to the derived model.

## SUT-Side Instrumentation

Missing. Future `Always` assertion point after `recalculateThreadsByProviderThreadId`: each recalculated thread's `lastMessageAt` equals max remaining message timestamp for that provider thread.

## Open Questions

- None
