# replay-dispatch-is-single-claim-and-counted

## Evidence Trail

- `dispatchReplays` lists queued replays, then `prepareReplayDispatch` claims each with `status = queued -> running`.
- `prepareReplayDispatch` selects mailbox events in ascending `(occurredAt, id)` order.
- `completeReplayDispatch` records `eventsReplayed` as the number of delivery requests.

## Failure Scenario

Generate queued replays and event logs. Concurrent dispatch control jobs must not double-claim a replay, and completed replay counts must equal created delivery requests.

## PBT Implementation Notes

Use Hegel with a fake core store for quick model checking and a DB-backed version for claim exclusivity. Inject a scheduler that can succeed or fail based on generated patterns.

## SUT-Side Instrumentation

Missing. Future `Always` assertion point: a completed replay has `eventsReplayed === deliveryRequests.length` for that dispatch.

## Open Questions

- None
