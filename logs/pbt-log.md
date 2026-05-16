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
