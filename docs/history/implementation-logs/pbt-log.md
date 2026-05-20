# PBT Implementation Log

## 2026-05-17 - Phase 1 Shared Hegel Test Harness

Completed phase 1 from `plans/antithesis-pbt-implementation-plan.md`.

### Changes

- Added package-local Hegel helpers:
  - `packages/core/src/test-hegel.ts`
  - `packages/gmail/src/test-hegel.ts`
  - `packages/db/src/test-hegel.ts`
- Helpers read `PBT_TEST_CASES`, default to 40 cases, and clamp invalid or tiny values to 5.
- Added `notePbtCase(...)` structured final-replay diagnostics for property slug plus generated family-specific context.
- Updated existing PBT files to use shared settings and notes:
  - `packages/core/src/internal-message-codec.pbt.test.ts`
  - `packages/core/src/webhook-delivery-execution.pbt.test.ts`
  - `packages/gmail/src/history.pbt.test.ts`
  - `packages/db/src/persistence/canonical-state-mappers.pbt.test.ts`
  - `packages/db/src/persistence/pagination-cursors.pbt.test.ts`

### Verification

- `pnpm --filter @mailmon/core test -- src/internal-message-codec.pbt.test.ts src/webhook-delivery-execution.pbt.test.ts` - passed
- `pnpm --filter @mailmon/gmail test -- src/history.pbt.test.ts` - passed
- `pnpm --filter @mailmon/db test -- src/persistence/canonical-state-mappers.pbt.test.ts src/persistence/pagination-cursors.pbt.test.ts` - passed
- `PBT_TEST_CASES=5 pnpm --filter @mailmon/core test -- src/webhook-delivery-execution.pbt.test.ts` - passed
- `pnpm typecheck` - passed
- `pnpm lint` - passed
- `pnpm format:check` - passed

### Notes

- Consulted `effect-solutions` before touching test code, per repo instructions.
- Used local Hegel source in `.repos/hegel` to confirm `tc.note(...)` final-replay behavior and available settings.

## 2026-05-17 - Phase 2 DB-Backed Mailbox Commit Safety

Completed phase 2 from `plans/antithesis-pbt-implementation-plan.md`.

### Changes

- Added `packages/db/src/mailbox-sync-commit.pbt.test.ts`.
- Added generated DB-backed coverage for:
  - `cursor-never-regresses`
  - `lease-loss-prevents-stale-commit`
  - `state-cursor-events-commit-atomically`
  - `sync-snapshot-application-is-idempotent`
  - the DB-backed `label-ids-are-normalized` gap
- The generator builds bounded mailbox sync snapshots with one mailbox, one to three thread domains, zero to six messages, small provider ID domains, ordered received timestamps, duplicate/reordered label arrays, deleted ID domains, and cursor families spanning null, decimals, prefixed ordinals, equal values, and arbitrary text.
- The generated assertions inspect real PostgreSQL state after commits: mailbox cursor and lease fields, sync run completion, canonical message/thread rows, mailbox event rows, event payload label normalization, rollback behavior, stale lease no-op behavior, and idempotent reapplication behavior.
- Added structured `tc.note(...)` context for every generated property family so shrunk failures include cursor pairs, stale lease family, snapshot sizes, deleted IDs, and label variants.

### Verification

- `pnpm --filter @mailmon/db test -- src/mailbox-sync-commit.pbt.test.ts` - passed
- `pnpm --filter @mailmon/db test -- src/mailbox-event-emission.test.ts` - passed
- `PBT_TEST_CASES=5 pnpm --filter @mailmon/db test -- src/mailbox-sync-commit.pbt.test.ts` - passed after final formatting/type fixes
- `pnpm typecheck` - passed
- `pnpm lint` - passed
- `pnpm format:check` - passed

### Notes

- Consulted `effect-solutions` before writing the Effect-backed test helper code, per repo instructions.
- The user-referenced `./repos/hegel` path was not present; the local Hegel source is available at `.repos/hegel` and was used for generator/API context.
- The DB package's Vitest invocation runs the full DB test set even when a specific file argument is supplied; the targeted commands reported `12 passed` test files and `55 passed` tests.

## 2026-05-17 - Phase 3 Mailbox Single-Flight Sync Execution

Started phase 3 from `plans/antithesis-pbt-implementation-plan.md`.

### Changes

- Added generated core service-model coverage in `packages/core/src/mailbox-sync-execution.pbt.test.ts`.
- Added generated DB-backed durable lease acquisition coverage in `packages/db/src/mailbox-sync-execution.pbt.test.ts`.
- Targeted property slug:
  - `mailbox-lease-single-flight`
- Core property generates two to six concurrent sync attempts, start delays, provider delays, provider success/failure outcomes, and an optional preexisting active lease. It asserts at most one provider snapshot can apply and skipped attempts have no cursor, mailbox-event, or webhook-scheduling effects.
- DB-backed property generates concurrent `runMailboxSync` calls against isolated PostgreSQL through `createCorePersistenceLayer`, with empty and expired lease families. It asserts durable sync runs record at most one completed application and all skipped runs have zero events and null next cursor.
- DB-backed expired-lease takeover property asserts a new owner can take over an expired lease and the stale owner cannot commit afterward.

### Verification

- `pnpm --filter @mailmon/core test -- src/mailbox-sync-execution.pbt.test.ts` - passed
- `pnpm --filter @mailmon/db test -- src/mailbox-sync-execution.pbt.test.ts` - passed
- `pnpm --filter @mailmon/core test -- src/use-cases.test.ts` - passed
- `pnpm --filter @mailmon/db test -- src/mailbox-sync-commit.pbt.test.ts` - passed
- `PBT_TEST_CASES=5 pnpm --filter @mailmon/core test -- src/mailbox-sync-execution.pbt.test.ts` - passed after formatting
- `PBT_TEST_CASES=5 pnpm --filter @mailmon/db test -- src/mailbox-sync-execution.pbt.test.ts` - passed after formatting
- `pnpm typecheck` - passed
- `pnpm lint` - passed
- `pnpm format:check` - passed after running package formatters

### Notes

- Consulted `effect-solutions` before writing Effect test layers, per repo instructions.
- The user-referenced `./repos/hegel` path is still absent; `.repos/hegel` is present and was used for Hegel async-test context.

## 2026-05-17 - Phase 4 Generated Thread Recalculation

Completed phase 4 from `plans/antithesis-pbt-implementation-plan.md`.

### Changes

- Extended `packages/db/src/mailbox-sync-commit.pbt.test.ts`.
- Targeted property slug:
  - `thread-summary-follows-latest-message`
- Added a generated DB-backed delete-only snapshot property that:
  - creates two to four provider threads with one to four messages per thread,
  - applies a baseline snapshot through the public mailbox sync commit path,
  - applies a delete-only snapshot that exercises newest, oldest, middle, all-but-one, and all-message deletion families,
  - derives the expected thread model from remaining messages by `(receivedAt desc, id desc)`,
  - asserts stored thread rows match that model,
  - asserts deleted provider messages are absent,
  - asserts removed-last-message behavior is explicit: a provider thread with no remaining messages is absent,
  - asserts `thread.updated` events emitted by the delete commit match the derived changed-thread model.
- Updated `antithesis/scratchbook/property-catalog.md` with the implemented workload status and refreshed the catalog commit provenance.

### Verification

- `pnpm --filter @mailmon/db test -- src/mailbox-sync-commit.pbt.test.ts` - passed
- `pnpm --filter @mailmon/db lint` - passed
- `pnpm --filter @mailmon/db typecheck` - passed
- `pnpm --filter @mailmon/db format:check` - passed

### Notes

- Consulted `effect-solutions` before extending the Effect-backed DB test code, per repo instructions.
- The requested `./repos/hegel` path is absent in this checkout; `.repos/hegel` is present and was used for Hegel context.

## 2026-05-17 - Phase 5 Webhook Delivery State Machine PBT

Completed phase 5 from `plans/antithesis-pbt-implementation-plan.md`.

### Changes

- Added `packages/db/src/webhook-delivery-runtime.pbt.test.ts`.
- Added generated DB-backed coverage for:
  - `webhook-delivery-id-stable-dedupes-scheduling`
  - `webhook-claim-is-exclusive-and-stale-recoverable`
  - the service-layer scheduler side-effect piece of `terminal-webhook-outcomes-do-not-reschedule`
- Stable delivery ID coverage generates mailbox event types, endpoint subscription families, duplicate event input IDs, and repeated scheduling calls through `scheduleMailboxEventDeliveries`. It asserts one durable row per requested `(mailbox_event_id, webhook_endpoint_id)` pair and verifies every row ID equals `createStableWebhookDeliveryId(...)`.
- Claim coverage generates concurrent pending claims without sleeps and asserts exactly one durable transition to `processing` with one attempt increment.
- Stale recovery coverage generates non-stale, exact-timeout, and stale processing rows, then fires concurrent claims and inspects final durable `attemptCount`, `processingStartedAt`, and `lastAttemptedAt`.
- Terminal service-layer coverage runs `runWebhookDelivery` against durable pending rows with generated delivered, terminal HTTP, nonretryable failure, exhausted HTTP, and exhausted failure outcomes, using a fake scheduler to assert zero follow-up scheduling calls.
- Updated `antithesis/scratchbook/property-catalog.md` with implemented workload statuses and refreshed the catalog commit provenance.

### Verification

- `PBT_TEST_CASES=5 pnpm --filter @mailmon/db test -- src/webhook-delivery-runtime.pbt.test.ts` - passed
- `pnpm --filter @mailmon/db test -- src/webhook-delivery-runtime.pbt.test.ts` - passed
- `pnpm --filter @mailmon/db test -- src/webhook-delivery-runtime.test.ts` - passed
- `pnpm --filter @mailmon/core test -- src/webhook-delivery-execution.pbt.test.ts` - passed
- `pnpm --filter @mailmon/db typecheck` - passed
- `pnpm --filter @mailmon/db lint` - passed
- `pnpm --filter @mailmon/db format:check` - passed

### Notes

- Consulted `effect-solutions` before writing the Effect-backed DB test code, per repo instructions.
- The requested `./repos/hegel` path is absent in this checkout; `.repos/hegel` is present and was used for Hegel runner and generator context.
- The DB package's Vitest invocation continues to run the full DB test set even when a specific file argument is supplied; the targeted DB commands reported `14 passed` test files and `62 passed` tests.

## 2026-05-17 - Phase 6 Replay State Machine PBT

Completed phase 6 from `plans/antithesis-pbt-implementation-plan.md`.

### Changes

- Added `packages/db/src/replay.pbt.test.ts`.
- Added generated DB-backed coverage for:
  - `replay-active-ranges-do-not-overlap`
  - `replay-dispatch-is-single-claim-and-counted`
- Active range coverage generates concurrent public `createReplay` requests across identical, nested, partial-overlap, touching-boundary, disjoint, different-mailbox, different-endpoint, and different-workspace families. It also seeds overlapping inactive replay rows to prove completed/failed/cancelled ranges do not block new active ranges.
- Dispatch coverage generates event logs with timestamp ties and IDs that sort differently from timestamp order, replay ranges that select zero/one/many events, and concurrent `dispatchReplays` calls. It asserts one dispatch claim, durable completion, `eventsReplayed` counts, delivery row counts, and scheduler order by ascending `(occurredAt, id)`.
- Updated `createWebhookDeliveriesForReplay` in `packages/db/src/persistence/webhook-deliveries.ts` to preserve caller event order while still deduping event IDs. This keeps replay dispatch ordering aligned with `prepareReplayDispatch`'s `(occurredAt, id)` selection order.
- Updated `antithesis/scratchbook/property-catalog.md` with the implemented workload status for both replay properties.

### Verification

- `PBT_TEST_CASES=5 pnpm --filter @mailmon/db test -- src/replay.pbt.test.ts` - passed; DB package script ran the full DB test set and reported `15 passed` test files and `64 passed` tests.
- `pnpm --filter @mailmon/db test -- src/replay.pbt.test.ts` - passed; DB package script ran the full DB test set and reported `15 passed` test files and `64 passed` tests.
- `pnpm --dir packages/db exec vitest run src/replay.pbt.test.ts` - passed, `1` test file and `2` tests.
- `pnpm --dir packages/db exec vitest run src/replay.test.ts` - passed, `1` test file and `7` tests.
- `pnpm --filter @mailmon/db typecheck` - passed
- `pnpm --filter @mailmon/db lint` - passed
- `pnpm --filter @mailmon/db format:check` - passed

### Notes

- Consulted `effect-solutions` before writing the Effect-backed DB test code, per repo instructions.
- The requested `./repos/hegel` path is absent in this checkout; `.repos/hegel` is present and was used for Hegel context.
- `pnpm --filter @mailmon/db test -- src/replay.test.ts` still runs the full DB suite rather than only `src/replay.test.ts`; that full-suite invocation failed once on the pre-existing `mailbox-lease-single-flight` DB PBT with Hegel's "Flaky test detected" error. Direct Vitest execution of `src/replay.test.ts` passed.

## 2026-05-17 - Phase 7 Gmail History Depth

Completed phase 7 from `plans/antithesis-pbt-implementation-plan.md`.

### Changes

- Extended `packages/gmail/src/history.pbt.test.ts`.
- Targeted property slug:
  - `history-delete-wins-compaction`
- The generated history property now builds two to four Gmail history pages with page-token chains and final per-page `historyId` values.
- Each generated case forces a cross-page change/delete conflict so delete-wins compaction is checked across page boundaries, not only inside one returned page.
- Added generated `getMessage: null` races for changed IDs that disappear between history compaction and fetch; these IDs are fetched when changed, but are not returned as messages.
- Added assertions that deleted IDs are never fetched or returned and that the delta cursor equals the final page's `historyId`.
- Updated `antithesis/scratchbook/properties/history-delete-wins-compaction.md` and `antithesis/scratchbook/property-catalog.md` to reflect the completed multi-page/missing-message coverage.

### Verification

- `PBT_TEST_CASES=5 pnpm --filter @mailmon/gmail test -- src/history.pbt.test.ts` - passed; package invocation reported `2` passed test files and `26` passed tests.
- `pnpm --filter @mailmon/gmail test -- src/history.pbt.test.ts` - passed; package invocation reported `2` passed test files and `26` passed tests.
- `pnpm --filter @mailmon/gmail typecheck` - passed
- `pnpm --filter @mailmon/gmail lint` - passed
- `pnpm --filter @mailmon/gmail format:check` - passed

### Notes

- Consulted `effect-solutions` before touching the Effect-adjacent test code, per repo instructions.
- The requested `./repos/hegel` and `./antithesis/sratchbook` paths are absent in this checkout; `.repos/hegel` and `antithesis/scratchbook` were used instead.

## 2026-05-17 - Phase 8 Gmail Push Fanout

Completed phase 8 from `plans/antithesis-pbt-implementation-plan.md`.

### Changes

- Added `packages/core/src/gmail-push-notification.pbt.test.ts`.
- Targeted property slug:
  - `gmail-push-is-wakeup-only-and-fans-out`
- Added generated core service-boundary coverage for accepted Gmail push fanout:
  generated notifications, zero to eight fake store-returned mailboxes, duplicate mailbox IDs from the current store result semantics, exact dispatcher call ordering, and `dispatched` count equality.
- Added generated dispatcher failure coverage with non-empty fake store results and a generated failing mailbox ID, asserting the failure propagates.
- The PBT layer only provides `MailboxPushNotificationStore` and `MailboxSyncDispatcher`, so direct calls to `MailboxStateStore`, Gmail APIs, or event stores would fail layer resolution.
- Updated `antithesis/scratchbook/properties/gmail-push-is-wakeup-only-and-fans-out.md` and `antithesis/scratchbook/property-catalog.md` to reflect the implemented workload status.

### Verification

- `PBT_TEST_CASES=5 pnpm --filter @mailmon/core test -- src/gmail-push-notification.pbt.test.ts` - passed; package invocation reported `10` passed test files and `96` passed tests.
- `pnpm --filter @mailmon/core test -- src/gmail-push-notification.pbt.test.ts` - passed; package invocation reported `10` passed test files and `96` passed tests.
- `pnpm --filter @mailmon/core test -- src/use-cases.test.ts` - passed; package invocation reported `10` passed test files and `96` passed tests.
- `pnpm --filter @mailmon/core typecheck` - passed
- `pnpm --filter @mailmon/core lint` - passed
- `pnpm --filter @mailmon/core format:check` - passed

### Notes

- Consulted `effect-solutions` before writing the Effect-backed core test layers, per repo instructions.
- The requested `./repos/hegel` and `./antithesis/sratchbook` paths are absent in this checkout; `.repos/hegel` and `antithesis/scratchbook` were used instead.

## 2026-05-17 - Phase 9 Documentation And CI Alignment

Completed phase 9 from `plans/antithesis-pbt-implementation-plan.md`.

### Changes

- Updated `docs/testing-requirements.md` section `4.4 Deterministic Simulation Testing` to make Hegel/Vitest the repo's property-based testing direction.
- Removed the stale future fast-check direction and documented the implemented backend PBT coverage: mailbox sync commit safety, single-flight sync execution, Gmail history compaction, Gmail push fanout, webhook delivery claims/outcomes, Replay overlap/dispatch, internal worker codecs, and pagination cursors.
- Documented PR-time versus nightly/manual counts: default PBT uses 40 cases through package-local helpers, while expanded runs use `PBT_TEST_CASES=250 pnpm test:pbt`.
- Stated that Antithesis is property vocabulary and future portability only until platform access, SDK assertions, and output plumbing exist in this repo.
- Added a root `test:pbt` script that runs the core/gmail/db package test lanes where Hegel PBT lives.
- Added `.github/workflows/pbt-nightly.yml` as a scheduled/manual opt-in PBT workflow with PostgreSQL and `PBT_TEST_CASES=250`.
- Added `~/.cache/hegel` caching to normal CI and the nightly PBT workflow for Hegel's private `uv` install path.
- Disabled file-level parallelism in the DB Vitest project so generated PostgreSQL state-machine properties run deterministically in the default package test path.
- Updated `docs/launch-readiness.md` with the new PBT evidence and CI posture.

### Verification

- `pnpm format:check` - passed
- `pnpm --filter @mailmon/db test -- src/mailbox-sync-execution.pbt.test.ts` - passed after DB Vitest file serialization; package invocation reported `15` passed test files and `64` passed tests.
- `pnpm test` - passed after DB Vitest file serialization; Turbo reported `18` successful tasks.

### Notes

- Consulted `effect-solutions` before phase work per repo instructions.
- Referenced `.repos/hegel` to confirm Hegel uses `uv` and caches its private install under `~/.cache/hegel`.
- Two full `pnpm test` attempts before DB Vitest file serialization reproduced Hegel's flaky-test detector in `packages/db/src/mailbox-sync-execution.pbt.test.ts`; serializing DB test files removed the cross-file race while preserving the default PBT path.
- The requested `./antithesis/sratchbook` path is absent in this checkout; `antithesis/scratchbook` was used instead.
