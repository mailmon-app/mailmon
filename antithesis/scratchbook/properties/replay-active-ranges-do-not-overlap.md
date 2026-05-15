# replay-active-ranges-do-not-overlap

## Evidence Trail

- `createReplayStoreLayer` checks active queued/running replay ranges for the same workspace, mailbox, and endpoint.
- It handles active overlap constraint violations and Postgres deadlocks by rechecking committed conflicts.
- Schema contains `replays_mailbox_endpoint_status_range_idx`, and migration `0013_replay_overlap_guard.sql` indicates a dedicated overlap guard exists.

## Failure Scenario

Generate replay requests with time ranges, statuses, and identities. Overlapping active ranges for the same mailbox/endpoint must fail; disjoint ranges or different identities may coexist.

## PBT Implementation Notes

Use DB-backed Hegel tests. Run concurrent `createReplay` calls with generated ranges and assert the final active set has no overlaps per `(workspaceId, mailboxId, webhookEndpointId)`.

## SUT-Side Instrumentation

Missing. Future `Always` assertion point after replay creation: the active replay set for that mailbox/endpoint is pairwise non-overlapping.

## Open Questions

- None
