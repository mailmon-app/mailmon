# history-delete-wins-compaction

## Evidence Trail

- `packages/gmail/src/history.ts` compacts Gmail history records before fetching changed messages.
- `messagesDeleted` adds the ID to `deletedMessageIds` and removes it from `changedMessageIds`.
- Add and label changes only add to changed IDs when the ID has not already been deleted.

## Failure Scenario

Generate history records with repeated `messagesAdded`, `labelsAdded`, `labelsRemoved`, and `messagesDeleted` for the same IDs in arbitrary order. A deleted ID must not be fetched as changed.

## PBT Implementation Notes

Since `compactGmailHistoryRecords` is private, test through `listGmailHistoryDelta` with a generated fake `GmailHttpClient` and generated `getMessage`. Keep page counts small so failures shrink cleanly.

## SUT-Side Instrumentation

Missing. Future `Always` assertion point inside history delta construction: no returned message ID appears in `deletedMessageIds`.

## Open Questions

- None
