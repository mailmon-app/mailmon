# sync-snapshot-application-is-idempotent

## Evidence Trail

- Message and thread tables use unique constraints on `(mailbox_id, provider_message_id)` and `(mailbox_id, provider_thread_id)`.
- `applySnapshotMessages` emits `message.created` only for absent provider message IDs and `message.updated` only when canonical content changes.
- `applyRecalculatedThreads` emits `thread.updated` only when a thread is absent or changed.
- `insertMailboxEvents` uses stable event IDs and `onConflictDoNothing`.

## Failure Scenario

Generate a valid snapshot, apply it, then apply a semantically identical snapshot with a non-regressing cursor. The second commit must not create duplicate rows or events for unchanged canonical content.

## PBT Implementation Notes

Use Hegel-generated message sets with duplicate label orderings and stable provider IDs. Check row counts and event counts before/after the second commit.

## SUT-Side Instrumentation

Missing. Future `Always` assertion point: when applying an unchanged existing message/thread, assert no mailbox event is emitted for that resource.

## Open Questions

- None
