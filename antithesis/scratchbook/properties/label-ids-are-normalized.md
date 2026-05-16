# label-ids-are-normalized

## Evidence Trail

- `normalizeLabelIds` sorts and deduplicates label IDs.
- `toMessageInsert`, `toMessageUpdateSet`, and mailbox event mappers all use normalized label IDs.
- `isSameCanonicalMessage` compares normalized generated labels against stored labels.

## Failure Scenario

Generate arrays of label IDs with duplicates, empty-ish variants excluded, and random ordering. Equivalent label sets must store and emit the same sorted unique array and must not trigger false updates.

## PBT Implementation Notes

Partially implemented. `packages/db/src/persistence/canonical-state-mappers.pbt.test.ts` covers pure normalization plus row and event mapper output. `packages/gmail/src/history.pbt.test.ts` covers Gmail projection preserving generated label arrays before DB normalization.

Remaining improvement: add a DB-backed idempotency property that changes only label order/duplicates between snapshots and asserts no false message update event is emitted.

## SUT-Side Instrumentation

Native Antithesis SDK instrumentation is missing. Local Hegel workload is partially present. Future `Always` assertion point: before emitting a message event, assert payload `labelIds` equals `normalizeLabelIds(payload.labelIds)`.

## Open Questions

- None
