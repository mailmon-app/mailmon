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
