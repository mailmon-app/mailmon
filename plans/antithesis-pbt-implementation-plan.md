# Plan: Antithesis-Informed Local PBT Implementation

> Source artifacts: `antithesis/scratchbook/`
> Current date: 2026-05-17
> Scope: local/CI property-based testing with Hegel first; Bombadil later; native Antithesis SDK/platform work deferred.

## Purpose

The scratchbook has already done the research pass. It identifies Mailmon's core correctness risks, maps them to concrete properties, and evaluates the first Hegel increment. This plan turns those findings into an implementation sequence that can be executed in small, reviewable slices.

The goal is not to add more generic test volume. The goal is to make rare mailbox sync, webhook, replay, and Gmail history state-machine failures shrinkable, reproducible, and cheap enough to run in normal development and CI.

## Evaluated Findings

The useful conclusion across `evaluation/synthesis.md`, `evaluation/coverage-balance.md`, `evaluation/implementability.md`, `evaluation/antithesis-fit.md`, and `evaluation/wildcard.md` is consistent:

- Hegel is already wired into `@mailmon/core`, `@mailmon/gmail`, and `@mailmon/db`.
- The first pure PBT increment is real and passing, but it mostly covers deterministic mapper/codec/classification logic.
- The highest remaining risk lives in real PostgreSQL transaction and claim boundaries, especially mailbox leases, stale commits, cursor regression, webhook claim recovery, and replay overlap.
- Hegel's public package should be treated as local Vitest PBT only. The Antithesis-style output path exists in local Hegel source but is not exported by `@hegeldev/hegel` 0.2.2.
- Bombadil is a valid browser/docs fuzzer, but it is low priority for a backend state-sync product and should not compete with DB-backed PBT.
- `docs/testing-requirements.md` still mentions fast-check and should be updated once this branch's Hegel direction is finalized.

## Current Coverage Map

Implemented local Hegel:

- `history-delete-wins-compaction`
- `initial-sync-catchup-delete-wins`
- `webhook-retry-delay-bounded-monotonic`
- `internal-worker-codecs-reject-malformed-envelopes`
- `pagination-cursors-roundtrip-and-reject-junk`

Partially implemented local Hegel:

- `label-ids-are-normalized`
- `terminal-webhook-outcomes-do-not-reschedule`

Example/integration coverage exists, but generated PBT is still missing:

- `thread-summary-follows-latest-message`
- `gmail-push-is-wakeup-only-and-fans-out`
- mailbox sync execution properties
- webhook claim/delivery durability properties
- replay claim/overlap properties

Not implemented:

- `docs-browser-navigation-has-no-runtime-errors`

## Implementation Rules

- Keep properties named after the scratchbook slugs so failures map back to `antithesis/scratchbook/properties/*.md`.
- Prefer operation-sequence generators plus a small expected-state model over random imperative loops.
- Keep PR-time `testCases` modest and configurable; use larger counts only for nightly/manual runs.
- For DB-backed properties, reuse `withIsolatedDatabaseEffect` / `withIsolatedDatabasePromise` from `packages/db/src/test-setup.ts`.
- Keep generated DB scenarios small enough to shrink. Favor one mailbox, one endpoint, and bounded event/message sets unless a property needs multiple identities.
- Add `tc.note(...)` to every generated operation-sequence property so final replay output explains the shrunk case.
- Do not claim native Antithesis SDK assertions or `ANTITHESIS_OUTPUT_DIR` support until the repo actually wires exported APIs for it.
- Do not introduce Bombadil into the backend test command path.

## Phase 1: Shared Hegel Test Harness

### What To Build

Create a tiny shared helper for Hegel settings and diagnostics. Keep it local to test code unless multiple packages need the same implementation shape.

Candidate locations:

- `packages/core/src/test-hegel.ts`
- `packages/gmail/src/test-hegel.ts`
- `packages/db/src/test-hegel.ts`

If duplication becomes annoying after the first two packages, move only the stable helper shape into an existing internal test utility package or keep duplicated constants rather than creating a production dependency.

### Required Behavior

- Read `PBT_TEST_CASES` from the environment.
- Default to `40` test cases for PR-time package tests.
- Clamp invalid or tiny values to a useful minimum.
- Provide a helper for structured notes, such as property slug, operation sequence, cursor pair, malformed payload family, or replay range family.

### Existing Tests To Update

- `packages/core/src/internal-message-codec.pbt.test.ts`
- `packages/core/src/webhook-delivery-execution.pbt.test.ts`
- `packages/gmail/src/history.pbt.test.ts`
- `packages/db/src/persistence/canonical-state-mappers.pbt.test.ts`
- `packages/db/src/persistence/pagination-cursors.pbt.test.ts`

### Acceptance Criteria

- PBT case count can be raised with `PBT_TEST_CASES=250` without editing source files.
- Existing PBT files still pass with default settings.
- Generated failures have enough final replay context to identify the generated family or operation sequence.

### Verification

```bash
pnpm --filter @mailmon/core test -- src/internal-message-codec.pbt.test.ts src/webhook-delivery-execution.pbt.test.ts
pnpm --filter @mailmon/gmail test -- src/history.pbt.test.ts
pnpm --filter @mailmon/db test -- src/persistence/canonical-state-mappers.pbt.test.ts src/persistence/pagination-cursors.pbt.test.ts
PBT_TEST_CASES=5 pnpm --filter @mailmon/core test -- src/webhook-delivery-execution.pbt.test.ts
```

## Phase 2: DB-Backed Mailbox Commit Safety

### What To Build

Add `packages/db/src/mailbox-sync-commit.pbt.test.ts` for generated DB-backed tests around the commit boundary.

This phase should target:

- `cursor-never-regresses`
- `lease-loss-prevents-stale-commit`
- `state-cursor-events-commit-atomically`
- `sync-snapshot-application-is-idempotent`
- the remaining DB-backed piece of `label-ids-are-normalized`

### Generator Shape

Use a bounded mailbox sync snapshot generator:

- one workspace and one mailbox
- one to three provider threads
- zero to six messages
- generated provider message IDs from a small alphabet
- generated provider thread IDs with valid grouping
- received timestamps from a small ordered range
- labels from a bounded set with duplicates and random order
- deleted provider message IDs from the generated message ID domain
- cursors from decimal strings, prefixed ordinals, arbitrary text, equal values, and null

### Scenario Families

1. Cursor regression:
   - Seed mailbox with generated current cursor.
   - Arm a sync run.
   - Apply a generated snapshot with generated next cursor.
   - Assert regressions fail with `mailbox_cursor_regressed` and leave cursor, state rows, sync run, and events unchanged.
   - Assert non-regressions can commit and update cursor consistently.

2. Lease loss:
   - Seed mailbox with active lease owner A.
   - Attempt commit with owner B or with an expired lease timestamp.
   - Assert `applied: false`, empty event IDs, no cursor move, no canonical rows, and sync run remains running or records only expected bookkeeping.

3. Atomic commit:
   - Apply a generated valid snapshot.
   - Assert mailbox cursor, sync run `nextCursor`, sync run `eventsEmitted`, canonical message/thread rows, and mailbox event rows agree.
   - Add one rollback-inducing case modeled after the existing missing-sync-run example to ensure partial state is not persisted.

4. Snapshot idempotency:
   - Apply a generated snapshot.
   - Reapply a semantically equivalent snapshot with a non-regressing cursor.
   - Assert no duplicate messages, threads, or mailbox events.
   - Include label arrays with reordered duplicates to finish `label-ids-are-normalized`.

### Code To Reuse

- `packages/db/src/mailbox-event-emission.test.ts` for seed helpers, `armMailboxSync`, and commit assertions.
- `packages/db/src/persistence/mailbox-sync-commit.ts` for the transaction boundary.
- `packages/db/src/persistence/canonical-state-mappers.ts` for cursor and canonical mapper behavior.
- `packages/db/src/schema.ts` for direct inspection of mailbox, sync run, message, thread, and event rows.

### Acceptance Criteria

- Each property slug appears in a test name.
- Generated DB tests shrink to readable cases.
- Regressing cursor commits leave no partial rows.
- Stale lease commits leave no partial rows.
- Equivalent snapshots do not emit false message/thread events.
- Label order and duplicates do not create false update events.

### Verification

```bash
pnpm --filter @mailmon/db test -- src/mailbox-sync-commit.pbt.test.ts
pnpm --filter @mailmon/db test -- src/mailbox-event-emission.test.ts
```

## Phase 3: Mailbox Single-Flight Sync Execution

### What To Build

Add generated coverage for `mailbox-lease-single-flight`. Start with a fast service-model property in `packages/core/src/mailbox-sync-execution.pbt.test.ts`, then add a DB-backed variant if the pure model does not exercise the real lease acquisition path deeply enough.

### Scenario Families

1. Core service model:
   - Generate one mailbox, two to six sync attempts, provider delays, provider outcomes, and acquisition outcomes.
   - Use fake `MailboxSyncCoordinator`, `MailboxStateStore`, `MailboxSyncProvider`, and `WebhookDeliveryScheduler` layers.
   - Run generated attempts concurrently against `runMailboxSync`.
   - Assert at most one attempt applies a provider snapshot.
   - Assert skipped attempts do not advance cursor, emit mailbox events, or schedule webhook deliveries.

2. DB-backed lease acquisition:
   - Seed one mailbox with no active lease or an expired active lease.
   - Fire concurrent `runMailboxSync` calls through `createCorePersistenceLayer`.
   - Use generated provider snapshots that are distinguishable by worker/lease owner.
   - Assert final durable state reflects at most one applied sync for the lease interval.
   - Assert skipped sync runs are recorded as `skipped_due_to_active_lease` and have no next cursor or events.

3. Expired lease takeover:
   - Seed an expired active lease and active sync run.
   - Generate a new takeover attempt.
   - Assert new owner can acquire the mailbox and commit.
   - Assert stale owner cannot commit afterward; this should reuse the Phase 2 stale commit checks.

### Code To Reuse

- `packages/core/src/mailbox-sync-execution.ts` as the public workflow under test.
- `packages/core/src/use-cases.test.ts` existing lease contention examples.
- `packages/db/src/persistence/mailbox-sync-coordinator.ts` through the persistence layer for DB-backed acquisition.
- `packages/db/src/mailbox-event-emission.test.ts` seed and inspection patterns.

### Acceptance Criteria

- Generated concurrent attempts cannot produce two applied syncs for the same mailbox interval.
- Skipped attempts have no event IDs, no cursor advancement, and no webhook scheduling.
- DB-backed variant proves lease ownership is enforced by durable mailbox row state, not by in-memory fake state alone.

### Verification

```bash
pnpm --filter @mailmon/core test -- src/mailbox-sync-execution.pbt.test.ts
pnpm --filter @mailmon/core test -- src/use-cases.test.ts
pnpm --filter @mailmon/db test -- src/mailbox-sync-commit.pbt.test.ts
```

## Phase 4: Generated Thread Recalculation

### What To Build

Extend `packages/db/src/mailbox-sync-commit.pbt.test.ts` or add `packages/db/src/thread-summary.pbt.test.ts` for `thread-summary-follows-latest-message`.

### Scenario

- Generate two to four provider threads.
- Generate one to four messages per thread.
- Apply a baseline snapshot.
- Generate a delete-only snapshot that removes any subset, especially newest messages.
- Assert each remaining thread row reflects the newest remaining message by `(receivedAt desc, id desc)`.
- Assert deleted provider messages are absent.
- Assert removed-last-message behavior is explicit: either thread is removed, marked absent, or otherwise matches the repo's current intended behavior.

### Code To Reuse

- Existing fixed regression in `packages/db/src/mailbox-event-emission.test.ts`.
- `recalculateThreadsByProviderThreadId` behavior through the public commit path, not by testing internals directly.

### Acceptance Criteria

- Generated delete sequences cover deleting newest, oldest, middle, all-but-one, and all messages for a provider thread.
- Thread summary rows and emitted `thread.updated` events agree with the derived model.

### Verification

```bash
pnpm --filter @mailmon/db test -- src/mailbox-sync-commit.pbt.test.ts
```

## Phase 5: Webhook Delivery State Machine PBT

### What To Build

Add `packages/db/src/webhook-delivery-runtime.pbt.test.ts` for durable webhook scheduling and claiming.

This phase should target:

- `webhook-delivery-id-stable-dedupes-scheduling`
- `webhook-claim-is-exclusive-and-stale-recoverable`
- the remaining service-layer piece of `terminal-webhook-outcomes-do-not-reschedule`

### Scenario Families

1. Stable delivery IDs and dedupe:
   - Generate mailbox events, endpoint subscriptions, duplicate event inputs, and repeated scheduling calls.
   - Call `scheduleMailboxEventDeliveries` or the underlying store through the normal core persistence layer.
   - Assert one durable row per `(mailbox_event_id, webhook_endpoint_id)`.
   - Assert every returned delivery ID equals the stable ID for that pair.

2. Exclusive claim:
   - Seed one due pending delivery.
   - Fire several `prepareWebhookDeliveryAttempt` calls concurrently for the same delivery.
   - Assert exactly one succeeds before stale timeout.
   - Assert `attemptCount` increments exactly once.

3. Stale recovery:
   - Seed a processing delivery with generated `processingStartedAt` relative to the timeout.
   - Assert non-stale rows are not reclaimable.
   - Assert stale rows are reclaimable and increment `attemptCount` exactly once per successful claim.

4. Terminal no-reschedule service check:
   - Run `runWebhookDelivery` or `finalizeWebhookDelivery` with terminal classifications and a fake scheduler that records calls.
   - Assert delivered, nonretryable failed, and retry-exhausted outcomes make zero scheduler calls.

### Code To Reuse

- `packages/db/src/webhook-delivery-runtime.test.ts` seed fixtures and fake scheduler pattern.
- `packages/db/src/persistence/webhook-deliveries.ts` through exported core service layers.
- `packages/core/src/webhook-delivery-execution.pbt.test.ts` for pure classification generators.

### Acceptance Criteria

- Concurrent claim tests do not depend on arbitrary sleeps.
- Claim and stale-recovery cases inspect final durable rows, not just returned values.
- Scheduler side effects are asserted with a fake service.

### Verification

```bash
pnpm --filter @mailmon/db test -- src/webhook-delivery-runtime.pbt.test.ts
pnpm --filter @mailmon/db test -- src/webhook-delivery-runtime.test.ts
pnpm --filter @mailmon/core test -- src/webhook-delivery-execution.pbt.test.ts
```

## Phase 6: Replay State Machine PBT

### What To Build

Add `packages/db/src/replay.pbt.test.ts` or extend `packages/db/src/replay.test.ts` with generated properties.

This phase should target:

- `replay-active-ranges-do-not-overlap`
- `replay-dispatch-is-single-claim-and-counted`

### Scenario Families

1. Active range overlap:
   - Generate replay ranges for same and different `(workspaceId, mailboxId, webhookEndpointId)`.
   - Generate active statuses (`queued`, `running`) and inactive statuses where useful.
   - Concurrently create overlapping active replay requests for the same identity.
   - Assert final active set is pairwise non-overlapping.
   - Assert one conflicting create returns `replay_conflict` instead of leaking a raw PostgreSQL error through the public use case.

2. Dispatch claim and count:
   - Generate event logs with occurred timestamps and IDs.
   - Generate replay ranges that select zero, one, or many events.
   - Run concurrent `dispatchReplays` calls.
   - Assert each replay transitions from queued to running/completed once.
   - Assert `eventsReplayed` equals durable delivery requests created for selected event IDs in ascending `(occurredAt, id)` order.

### Code To Reuse

- `packages/db/src/replay.test.ts` existing replay fixture, concurrent overlap test, runtime layer, and delivery inspection helpers.
- `packages/core/src/replay-dispatch.ts` through public use cases.
- `packages/db/src/persistence/replays.ts` only through service layers unless an assertion requires direct row inspection.

### Acceptance Criteria

- Generated overlapping ranges cover touching boundaries, nested ranges, identical ranges, disjoint ranges, and different endpoint/mailbox/workspace identities.
- Concurrent creates never leave two active overlapping rows for the same identity.
- Concurrent dispatch never double-counts replayed events.

### Verification

```bash
pnpm --filter @mailmon/db test -- src/replay.pbt.test.ts
pnpm --filter @mailmon/db test -- src/replay.test.ts
```

## Phase 7: Gmail History Depth

### What To Build

Extend `packages/gmail/src/history.pbt.test.ts` for the remaining `history-delete-wins-compaction` gap.

### Scenario Families

- Generate multiple Gmail history pages.
- Generate page tokens and final `historyId`.
- Generate changed IDs where `getMessage` sometimes returns `null` to model messages that disappear between history compaction and fetch.
- Keep delete-wins semantics global across all pages, not page-local.

### Acceptance Criteria

- Deleted IDs are never fetched or returned, even when add/label operations are on different pages.
- Changed IDs with `getMessage: null` are not returned as messages.
- The final delta cursor is the final page's `historyId`.

### Verification

```bash
pnpm --filter @mailmon/gmail test -- src/history.pbt.test.ts
```

## Phase 8: Gmail Push Fanout

### What To Build

Add Hegel coverage for `gmail-push-is-wakeup-only-and-fans-out`, likely in `packages/core/src/gmail-push-notification.pbt.test.ts` or the closest existing core workflow test module.

### Scenario Families

- Generate push notifications and matching mailbox lists.
- Use fake `MailboxPushNotificationStore` and `MailboxSyncDispatcher` layers.
- Assert accepted notifications dispatch exactly the returned mailbox list.
- Assert duplicate entries are handled according to current store semantics.
- Assert dispatch failures propagate without direct calls to `MailboxStateStore`, Gmail APIs, or event stores.

### Acceptance Criteria

- Test proves push is wake-up only at the service boundary.
- Test records dispatch calls and result `dispatched` count from the same generated model.

### Verification

```bash
pnpm --filter @mailmon/core test -- src/gmail-push-notification.pbt.test.ts
pnpm --filter @mailmon/core test -- src/use-cases.test.ts
```

## Phase 9: Documentation And CI Alignment

### What To Build

Update docs and CI expectations once the DB-backed PBT lane is stable.

### Documentation Updates

- Update `docs/testing-requirements.md` section `4.4 Deterministic Simulation Testing`.
- Replace the future fast-check wording with the implemented Hegel approach.
- Document PR-time versus nightly/manual PBT counts.
- State that Antithesis is vocabulary/future portability only until platform access exists.

### CI Updates

- Confirm normal package tests run PBT by default.
- Add an explicit workflow or job step only if normal `pnpm test` becomes too slow.
- Consider caching `~/.cache/hegel` or installing `uv` if Hegel cold starts become flaky.
- Add an optional nightly command with raised `PBT_TEST_CASES`.

### Acceptance Criteria

- The repo has one PBT direction in docs.
- CI does not depend on Antithesis platform access.
- Any nightly expansion is opt-in and does not slow every PR unnecessarily.

### Verification

```bash
pnpm test
pnpm format:check
```

## Phase 10: Optional Bombadil Browser Fuzzing

### When To Start

Start only after backend DB-backed PBT is stable and docs/browser fuzzing is explicitly worth CI cost.

### What To Build

- Add Bombadil dependency in the appropriate docs/browser package or tooling location.
- Add `antithesis/bombadil/docs.spec.ts`.
- Run against a local docs server.

### Property

Target `docs-browser-navigation-has-no-runtime-errors`:

- default properties for uncaught exceptions, promise rejections, console errors, and HTTP error responses
- reachability for Quickstart, Webhooks, Replays, and API reference pages
- custom actions for sidebar/nav links only if default actions are insufficient

### Verification

```bash
pnpm --filter @mailmon/docs dev
bombadil test http://127.0.0.1:3333 antithesis/bombadil/docs.spec.ts --headless --time-limit 2m --exit-on-violation
```

## Suggested Execution Order

1. Phase 1: shared Hegel settings and `tc.note` diagnostics.
2. Phase 2: DB-backed mailbox commit safety.
3. Phase 3: mailbox single-flight sync execution.
4. Phase 4: generated thread recalculation.
5. Phase 5: webhook delivery state machine PBT.
6. Phase 6: replay state machine PBT.
7. Phase 7: multi-page Gmail history and missing-message races.
8. Phase 8: Gmail push fanout.
9. Phase 9: testing docs and CI alignment.
10. Phase 10: Bombadil docs fuzzing.

This order follows the scratchbook's risk ranking: first improve failure diagnostics, then cover the real transaction and claim boundaries, then deepen already-implemented pure properties, then update docs and optional browser fuzzing.

## Definition Of Done

- All high-priority DB-backed properties in `antithesis/scratchbook/property-catalog.md` have Hegel coverage.
- Existing pure PBT files use shared configurable settings and useful final replay notes.
- The remaining partial properties are either completed or explicitly documented as deferred.
- `docs/testing-requirements.md` no longer points future work at fast-check when the repo is using Hegel.
- `pnpm --filter @mailmon/core test`, `pnpm --filter @mailmon/gmail test`, and `pnpm --filter @mailmon/db test` pass.
- `pnpm lint`, `pnpm typecheck`, `pnpm format:check`, and `pnpm test` pass before merging the full implementation series.

## Deferred Work

- Native Antithesis SDK assertions and `ANTITHESIS_OUTPUT_DIR` output.
- Antithesis container topology and `snouty` launch setup.
- Bombadil marketing-site fuzzing until `apps/marketing` is committed and in scope.
- Real Gmail-account live sandbox tests, GCP Pub/Sub retry validation, and infrastructure chaos testing. Those belong to the broader testing roadmap, not this local PBT increment.
