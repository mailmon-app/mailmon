# history-delete-wins-compaction

## Evidence Trail

- `packages/gmail/src/history.ts` compacts Gmail history records before fetching changed messages.
- `messagesDeleted` adds the ID to `deletedMessageIds` and removes it from `changedMessageIds`.
- Add and label changes only add to changed IDs when the ID has not already been deleted.

## Failure Scenario

Generate history records with repeated `messagesAdded`, `labelsAdded`, `labelsRemoved`, and `messagesDeleted` for the same IDs in arbitrary order. A deleted ID must not be fetched as changed.

## PBT Implementation Notes

Implemented in `packages/gmail/src/history.pbt.test.ts` by testing through `listGmailHistoryDelta` with a generated fake `GmailHttpClient` and generated history operation sequences. Current coverage uses one generated history page and successful `getMessage` calls for changed IDs.

Next improvement: generate multiple history pages and allow `getMessage` to return `null` for changed IDs that disappear between history compaction and message fetch.

## SUT-Side Instrumentation

Native Antithesis SDK instrumentation is missing. Local Hegel workload exists. Future `Always` assertion point inside history delta construction: no returned message ID appears in `deletedMessageIds`.

## Open Questions

- None
