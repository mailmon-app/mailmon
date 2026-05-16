# initial-sync-catchup-delete-wins

## Evidence Trail

- `packages/gmail/src/sync-workflows.ts` initial sync fetches profile, baseline messages, then catch-up history from the profile history boundary.
- `mergeInitialSyncMessages` removes baseline messages deleted during catch-up and suppresses catch-up messages whose IDs are deleted.

## Failure Scenario

Generate baseline messages, catch-up changed messages, and catch-up deleted IDs. Any deleted ID appearing in either source must be absent from merged initial sync messages.

## PBT Implementation Notes

Implemented in `packages/gmail/src/history.pbt.test.ts` with Hegel generators for Gmail message records with duplicate IDs across baseline/catch-up. The property checks set equality against the expected map of non-deleted latest records.

## SUT-Side Instrumentation

Native Antithesis SDK instrumentation is missing. Local Hegel workload exists. Future `Always` assertion point after merge: no merged message ID is present in catch-up deleted IDs.

## Open Questions

- None
