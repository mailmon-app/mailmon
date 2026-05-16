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
