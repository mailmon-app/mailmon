# label-ids-are-normalized

## Evidence Trail

- `normalizeLabelIds` sorts and deduplicates label IDs.
- `toMessageInsert`, `toMessageUpdateSet`, and mailbox event mappers all use normalized label IDs.
- `isSameCanonicalMessage` compares normalized generated labels against stored labels.

## Failure Scenario

Generate arrays of label IDs with duplicates, empty-ish variants excluded, and random ordering. Equivalent label sets must store and emit the same sorted unique array and must not trigger false updates.

## PBT Implementation Notes

Use a pure Hegel property over normalization plus a DB-backed idempotency property that changes only label order/duplicates between snapshots.

## SUT-Side Instrumentation

Missing. Future `Always` assertion point: before emitting a message event, assert payload `labelIds` equals `normalizeLabelIds(payload.labelIds)`.

## Open Questions

- None
