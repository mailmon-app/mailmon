# pagination-cursors-roundtrip-and-reject-junk

## Evidence Trail

- `packages/db/src/persistence/pagination-cursors.ts` encodes message/thread cursors as `cur_` plus base64url JSON with `id` and `timestamp`.
- Sync run cursors use `id` and `startedAt`.
- Decoders reject wrong prefixes, malformed base64/JSON, empty IDs, and invalid timestamps with `invalid_pagination_cursor`.

## Failure Scenario

Generate valid cursor positions and invalid strings. Valid values must round-trip exactly. Invalid values must fail as problem details instead of silently decoding to unsafe positions.

## PBT Implementation Notes

Use pure Hegel tests with `gs.text`, `gs.datetimes`, and structured records. Add mutation generators that corrupt prefix, payload shape, ID, and timestamp.

## SUT-Side Instrumentation

Missing. Future `AlwaysOrUnreachable` assertion point in public list handlers: any decoded cursor has non-empty ID and parseable timestamp.

## Open Questions

- None
