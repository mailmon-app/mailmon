# cursor-never-regresses

## Evidence Trail

- Cursor comparison lives in `packages/db/src/persistence/canonical-state-mappers.ts`.
- `isMailboxCursorRegression` treats `null` next cursor as regression when current is non-null, compares decimal cursors numerically, treats decimal current with nondecimal next as regression, and compares trailing ordinal cursors with the same prefix.
- `applyMailboxSyncCommit` fails with `mailbox_cursor_regressed` before applying snapshot writes.

## Failure Scenario

Generate current/next cursor pairs across decimal strings, same-prefix ordinals, different-prefix ordinals, arbitrary text, equal values, and nulls. A regression must fail and must not move the stored cursor.

## PBT Implementation Notes

Use a fast pure Hegel property for `isMailboxCursorRegression` semantics if exported or tested through public commit behavior. Add a DB-backed property that seeds current cursor and applies generated snapshots.

## SUT-Side Instrumentation

Missing. Future `Always` assertion point: before finalizing a sync commit, assert `!isMailboxCursorRegression(previousCursor, nextCursor)`.

## Open Questions

- None
