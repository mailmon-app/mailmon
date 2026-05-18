# Remaining Antithesis-Informed Testing Log

## 2026-05-18 - Phase 1: Provider-Failure Sandbox E2E

Completed `provider-failure-e2e-preserves-operational-state` from
`plans/antithesis-remaining-testing-work-plan.md`.

- Extended the in-file Gmail sandbox in `apps/api/src/sandbox-e2e.test.ts` with controllable provider faults for quota-style `403`, `429`, transient `503`, and expired history cursor `404`.
- Added full-runtime E2E coverage through the API runtime, worker HTTP runtime, Gmail HTTP provider, and PostgreSQL persistence for:
  - `quota-style-403-rate-limit`
  - `message-429-rate-limit`
  - `history-503-transient`
  - `expired-history-cursor`
- Asserted failed provider syncs return non-`2xx` worker HTTP responses, preserve mailbox cursor and canonical message/thread/event/webhook rows, and record mailbox operational state according to `packages/core/src/mailbox-operational-state.ts`.
- Kept the new provider-failure smoke matrix in the existing sandbox E2E lane. The focused sandbox suite now runs 7 tests in about 10 seconds locally, so this is still reasonable for PR-time coverage.

Verification:

```bash
pnpm exec vitest run apps/api/src/sandbox-e2e.test.ts
pnpm typecheck
pnpm format:check
pnpm test:coverage
```

Results:

- `apps/api/src/sandbox-e2e.test.ts`: 7 passed.
- `pnpm typecheck`: passed.
- `pnpm format:check`: passed.
- `pnpm test:coverage`: 28 files passed, 269 tests passed; statements 80.51%, branches 70.43%, functions 79.62%, lines 80.85%.
