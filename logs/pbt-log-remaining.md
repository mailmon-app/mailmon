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

## 2026-05-18 - Phase 2: Test-Time Lease Tuning

Completed `worker-death-lease-expiry-takeover`, `mailbox-lease-single-flight`,
and `lease-loss-prevents-stale-commit` setup work from
`plans/antithesis-remaining-testing-work-plan.md`.

- Added `MailboxSyncLeaseTiming` in `@mailmon/core` with production defaults:
  90,000 ms lease TTL and 30,000 ms heartbeat interval.
- Updated `runMailboxSync` to read lease TTL and heartbeat interval from the
  Effect service instead of hard-coded constants.
- Wired the worker runtime to `MailboxSyncLeaseTiming.defaultLayer`, preserving
  production behavior unless a test or runtime supplies explicit values.
- Updated core, DB, and worker test runtimes that call `runMailboxSync` to
  provide the timing layer.
- Shortened the core heartbeat tests to use a 300 ms TTL and 100 ms heartbeat
  interval, avoiding test waits tied to production lease intervals.

Verification:

```bash
pnpm --filter @mailmon/core test -- src/use-cases.test.ts src/mailbox-sync-execution.pbt.test.ts
pnpm --filter @mailmon/core build
pnpm --filter @mailmon/db test -- src/mailbox-sync-execution.pbt.test.ts src/mailbox-sync-commit.pbt.test.ts
pnpm --filter @mailmon/worker test -- src/processor.test.ts
pnpm typecheck
pnpm format:check
```

Results:

- `@mailmon/core` focused test command: 10 files passed, 96 tests passed.
- `@mailmon/db` package test command: 15 files passed, 64 tests passed. The
  command runs the full DB Vitest project from the workspace root.
- `@mailmon/worker` processor test command: 4 files passed, 37 tests passed.
- `pnpm typecheck`: passed.
- `pnpm format:check`: passed after formatting `packages/core/src/use-cases.test.ts`.

## 2026-05-18 - Phase 3: Local Worker-Death Chaos Harness

Completed `worker-death-lease-expiry-takeover` from
`plans/antithesis-remaining-testing-work-plan.md`.

- Added `apps/api/src/sandbox-chaos.test.ts`, a local chaos harness that runs
  PostgreSQL through the existing isolated DB helper, an API runtime, worker B
  in-process, worker A as a real child process, a Gmail sandbox, and a webhook
  receiver.
- Added a Gmail sandbox pause point on message fetch so worker A can acquire a
  real mailbox lease and enter provider sync before being killed.
- Added worker process lease timing env/config for
  `MAILMON_SYNC_LEASE_TTL_MS` and `MAILMON_SYNC_HEARTBEAT_INTERVAL_MS`, with
  production defaults preserved at 90,000 ms and 30,000 ms.
- Verified the test kills worker A with `SIGKILL`, waits for the shortened
  lease to expire, recovers through worker B's real `/internal/control-jobs`
  route, and asserts:
  - the old sync run is marked `lease_lost` with
    `stuck_mailbox_execution_recovered`
  - worker B completes the takeover sync
  - active lease fields are cleared
  - cursor, message, thread, and event rows reflect exactly one committed
    provider result
- Added logging for unexpected non-ProblemDetails worker route failures so
  future chaos failures include server-side context instead of only
  `worker_internal_error`.

Reference context:

- Rechecked `antithesis/scratchbook/properties/worker-death-lease-expiry-takeover.md`.
- Checked local Hegel context in `./.repos/hegel`; no native Antithesis output
  path was added, consistent with the plan's constraint that current Hegel usage
  remains Vitest-oriented.

Verification:

```bash
pnpm exec vitest run apps/api/src/sandbox-chaos.test.ts
pnpm exec vitest run apps/api/src/sandbox-e2e.test.ts
pnpm --filter @mailmon/worker test -- src/index.test.ts src/server.test.ts
pnpm --filter @mailmon/api typecheck
pnpm --filter @mailmon/worker typecheck
pnpm typecheck
pnpm format:check
```

Results:

- `apps/api/src/sandbox-chaos.test.ts`: 1 passed.
- `apps/api/src/sandbox-e2e.test.ts`: 7 passed.
- `@mailmon/worker` focused test command: 4 files passed, 37 tests passed.
- `@mailmon/api typecheck`: passed with 0 warnings and 0 errors.
- `@mailmon/worker typecheck`: passed with 0 warnings and 0 errors.
- `pnpm typecheck`: passed.
- `pnpm format:check`: passed.

## 2026-05-18 - Phase 4: PostgreSQL Impairment Harness

Completed `postgres-impairment-does-not-partially-commit` from
`plans/antithesis-remaining-testing-work-plan.md`.

- Added `docker-compose.test-faults.yml` with its own Compose project, a
  dedicated PostgreSQL 17 service on host port `55432`, and Toxiproxy on
  `8474`/`15432`, leaving the normal local `docker-compose.yml` topology
  untouched.
- Extended `packages/db/src/test-setup.ts` so isolated test databases can be
  created from an explicit base database URL. Phase 4 uses the direct database
  URL for setup/snapshots and routes the system-under-test persistence layer
  through the proxied URL.
- Added `packages/db/src/postgres-impairment.test.ts` for:
  - mailbox sync commit under proxy latency, asserting a complete valid commit
    outcome
  - mailbox sync commit with the proxy listener removed, asserting explicit
    failure and unchanged durable rows
  - webhook delivery claim under proxy latency, asserting a complete valid claim
    outcome
  - webhook delivery finalize with the proxy listener removed, asserting
    explicit failure and unchanged delivery/endpoint state
- Kept the test non-interfering with normal DB-backed suites: when Toxiproxy is
  unavailable it skips the impairment body unless
  `MAILMON_REQUIRE_DB_IMPAIRMENT_TESTS=1` is set.
- Checked local Hegel context in `./.repos/hegel`; no native Antithesis output
  path was added, consistent with the remaining-work plan's constraint that the
  current Hegel baseline remains Vitest-oriented.

Verification:

```bash
docker compose -f docker-compose.test-faults.yml up -d
MAILMON_REQUIRE_DB_IMPAIRMENT_TESTS=1 pnpm exec vitest run packages/db/src/postgres-impairment.test.ts
pnpm exec vitest run packages/db/src/postgres-impairment.test.ts
pnpm --filter @mailmon/db typecheck
pnpm --filter @mailmon/db format:check
pnpm typecheck
pnpm format:check
docker compose -f docker-compose.test-faults.yml down -v
```

Results:

- Fault stack started successfully. Toxiproxy image
  `ghcr.io/shopify/toxiproxy:2.12.0` was pulled locally.
- Required impairment run: `packages/db/src/postgres-impairment.test.ts`: 4
  passed.
- Plan command with the fault stack up:
  `packages/db/src/postgres-impairment.test.ts`: 4 passed.
- `@mailmon/db typecheck`: passed with 0 warnings and 0 errors.
- `@mailmon/db format:check`: passed.
- `pnpm typecheck`: passed; 14 tasks successful.
- `pnpm format:check`: passed; 9 tasks successful.
- Fault stack cleanup removed the dedicated containers, network, and volume.
