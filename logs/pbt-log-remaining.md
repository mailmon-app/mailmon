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

## 2026-05-19 - Phase 5: Deployed Pub/Sub Retry And Dead-Letter Validation

Completed `deployed-pubsub-retries-redispatch-sync` from
`plans/antithesis-remaining-testing-work-plan.md`.

- Added `scripts/staging-pubsub-retry-smoke.ts`, a staging/manual validation
  script that seeds a synthetic workspace/mailbox, publishes a real Pub/Sub
  mailbox sync dispatch, waits for dead-letter durable state, and prints a
  run-scoped cleanup command.
- Added the opt-in worker fixture
  `MAILMON_STAGING_PUBSUB_RETRY_SMOKE_MAILBOX_IDS`. Matching synthetic mailbox
  IDs return retryable `503` ProblemDetails from `/internal/sync`, producing
  real Pub/Sub retry/dead-letter behavior without customer data.
- The smoke script verifies configured Pub/Sub resources with `gcloud`, can
  verify the Cloud Run worker fixture env when `--worker-service` is provided,
  and can optionally require Cloud Logging evidence of repeated forced retries.
- Documented the staging runbook and cleanup path in
  `docs/staging-validation-guide.md`, and documented the staging-only worker
  env in `docs/deployment-guide.md` and `apps/worker/.env.schema`.
- Did not add a GitHub Actions workflow because the plan explicitly defers that
  until secrets, quotas, and cleanup ownership are decided.
- Rechecked local Hegel context in `./.repos/hegel`; no native Antithesis output
  path was added, consistent with the remaining-work plan's constraint that the
  current Hegel baseline remains Vitest-oriented.

Verification:

```bash
pnpm exec tsx scripts/staging-pubsub-retry-smoke.ts --help
pnpm --filter @mailmon/config test -- src/index.test.ts
pnpm --filter @mailmon/worker test -- src/processor.test.ts src/index.test.ts
pnpm --filter @mailmon/config build
pnpm --filter @mailmon/config typecheck
pnpm --filter @mailmon/worker typecheck
pnpm --filter @mailmon/api typecheck
pnpm build:libs
pnpm typecheck
pnpm format:check
pnpm exec tsc --noEmit --ignoreConfig --module NodeNext --moduleResolution NodeNext --target ES2024 --lib ES2024,DOM --types node --strict --skipLibCheck scripts/staging-pubsub-retry-smoke.ts
```

Results:

- Smoke script help path compiled and printed usage.
- `@mailmon/config` focused test command: 1 file passed, 11 tests passed.
- `@mailmon/worker` focused test command: 4 files passed, 38 tests passed.
- `@mailmon/config build`: passed.
- `@mailmon/config typecheck`: passed with 0 warnings and 0 errors.
- `@mailmon/worker typecheck`: passed with 0 warnings and 0 errors.
- `@mailmon/api typecheck`: passed with 0 warnings and 0 errors.
- `pnpm build:libs`: 5 tasks successful.
- `pnpm typecheck`: 14 tasks successful.
- `pnpm format:check`: 9 tasks successful.
- Direct script `tsc --noEmit` check: passed with `--skipLibCheck` to match the
  repo's TypeScript settings.

## 2026-05-19 - Phase 6: Load And Backpressure Budgets

Completed `internal-route-load-maintains-backpressure` from
`plans/antithesis-remaining-testing-work-plan.md`.

- Added report-only k6 scenarios:
  - `load/internal-sync.k6.js` drives `/internal/sync` across a small mailbox
    set and records latency, status buckets, retryable `5xx` count/rate, and
    lease-contention count/rate.
  - `load/webhook-deliveries.k6.js` drives `/internal/webhook-deliveries`
    across a small delivery set and records latency, status buckets,
    retryable `5xx` count/rate, webhook claim contention, scheduled retry
    responses, and optional settled processing-row counts.
- Added `load/lib/internal-route-budget-report.js` so both scenarios emit a
  repeatable JSON report with beta p95/p99, retryable `5xx`, DB pool
  saturation, and route-specific contention budgets.
- Added `scripts/run-load-smoke.sh` to run both scenarios or an individual
  scenario and write run-scoped JSON reports under `load/results/`. The wrapper
  uses a host `k6` binary when available and falls back to
  `docker run grafana/k6:latest` with host networking and the host UID/GID when
  it is not.
- Documented the manual/nightly workflow and environment knobs in
  `load/README.md`, and updated `docs/testing-requirements.md` to reflect the
  report-only load lane and remaining baseline work.
- Kept budgets non-enforcing. The JSON report marks each comparison as
  `enforced: false`, so promotion to CI failure remains a separate decision
  after local and staging baselines are collected.
- Rechecked local Hegel context in `./.repos/hegel`; Phase 6 is HTTP load
  scaffolding rather than Hegel PBT, so no native Antithesis/Hegel output path
  was added.

Verification:

```bash
pnpm exec oxlint --config ./.oxlintrc.json load/internal-sync.k6.js load/webhook-deliveries.k6.js load/lib/internal-route-budget-report.js
pnpm exec oxfmt --config ./.oxfmtrc.json --check load/README.md load/internal-sync.k6.js load/webhook-deliveries.k6.js load/lib/internal-route-budget-report.js scripts/run-load-smoke.sh .gitignore docs/testing-requirements.md logs/pbt-log-remaining.md
bash -n scripts/run-load-smoke.sh
node --check load/lib/internal-route-budget-report.js
node --check load/internal-sync.k6.js
node --check load/webhook-deliveries.k6.js
pnpm format:check
docker run --rm grafana/k6:latest version
docker run --rm --network host --volume "$PWD:/work" --workdir /work grafana/k6:latest inspect load/internal-sync.k6.js
docker run --rm --network host --volume "$PWD:/work" --workdir /work grafana/k6:latest inspect load/webhook-deliveries.k6.js
scripts/run-load-smoke.sh sync
```

Results:

- `oxlint`: passed with 0 warnings and 0 errors.
- `oxfmt --check`: passed after formatting the new files.
- `bash -n`: passed.
- `node --check`: passed for the shared helper and both k6 scenario files.
- `pnpm format:check`: passed; 9 tasks successful.
- Docker k6 image `grafana/k6:latest`: pulled and reported
  `k6 v2.0.0+dirty`.
- Docker `k6 inspect`: passed for both load scenarios.
- `MAILMON_LOAD_SYNC_DURATION=1s MAILMON_LOAD_SYNC_VUS=1
MAILMON_LOAD_REQUEST_TIMEOUT=1s scripts/run-load-smoke.sh sync`: exercised
  the Docker fallback path and wrote
  `load/results/internal-sync-20260518T204323Z.json`. Requests failed with
  connection refused because no local worker was running, so a meaningful load
  result still requires a seeded local or staging worker endpoint.
- `MAILMON_LOAD_WORKER_BASE_URL=http://host.docker.internal:3001
MAILMON_LOAD_RUN_ID=phase6-docker-worker MAILMON_LOAD_SYNC_DURATION=10s
MAILMON_LOAD_SYNC_VUS=4 MAILMON_LOAD_WEBHOOK_DURATION=10s
MAILMON_LOAD_WEBHOOK_VUS=4 MAILMON_LOAD_REQUEST_TIMEOUT=2s
scripts/run-load-smoke.sh all`: exercised both scenarios against a local
  worker reachable from Docker and wrote:
  - `load/results/internal-sync-phase6-docker-worker.json`: 685 total
    `/internal/sync` requests, 685 `4xx`, p95 17.34 ms, p99 20.61 ms,
    retryable `5xx` rate 0. Generated mailbox IDs were not seeded, so this was
    a route/reporter smoke rather than lease-contention signal.
  - `load/results/webhook-deliveries-phase6-docker-worker.json`: 672 total
    `/internal/webhook-deliveries` requests, 672 `2xx`, p95 18.64 ms, p99
    20.32 ms, retryable `5xx` rate 0, claim-contention rate 1.0. The
    report-only webhook claim-contention beta budget was marked over budget;
    this is expected with generated/unseeded delivery IDs and confirms the
    budget comparison path is visible without failing the run.

## 2026-05-19 - Phase 7: Keep The Hegel Lane Healthy

Completed the implemented backend PBT baseline maintenance pass from
`plans/antithesis-remaining-testing-work-plan.md`.

- Kept `vitest.pbt.config.ts` as the PBT-only entrypoint. It still defaults to
  `packages/{core,gmail,db}/src/**/*.pbt.test.ts` and supports explicit
  `PBT_INCLUDE` groups for the scheduled/manual workflow.
- Verified `.github/workflows/pbt-nightly.yml` still runs the Hegel lane with
  `PBT_TEST_CASES=10`, explicit include groups, and the `~/.cache/hegel` cache.
  No case-count increase was made because the current phase was a health pass,
  not a runtime-baseline expansion.
- Verified the three package-local `test-hegel.ts` helpers remain identical and
  still emit JSON `tc.note(...)` diagnostics with a `propertySlug`. No shared
  production/test utility dependency was introduced.
- Confirmed the operational tests from phases 1-6 stay outside the PBT-only
  config and that `pnpm test:coverage` continues to exclude `**/*.pbt.test.ts`.
- Fixed a coverage-lane regression found during verification:
  `apps/api/src/sandbox-chaos.test.ts` now passes
  `stagingPubSubRetrySmokeMailboxIds: []` to the worker child-process
  `WorkerEnv`, matching the field added for the staging Pub/Sub retry smoke
  fixture.
- Rechecked local Hegel context in `./.repos/hegel`; the current public package
  remains Vitest-oriented and uses `~/.cache/hegel` for the uv/core cache, so no
  native Antithesis output path was added.

Verification:

```bash
PBT_TEST_CASES=5 pnpm exec vitest run --config vitest.pbt.config.ts --reporter=dot
pnpm exec vitest run apps/api/src/sandbox-chaos.test.ts
pnpm test:coverage
pnpm --filter @mailmon/api typecheck
pnpm format:check
```

Results:

- PBT-only smoke: 11 files passed, 32 tests passed, duration 31.78 s.
- Focused worker-death chaos regression check: 1 file passed, 1 test passed.
- `pnpm test:coverage`: 30 files passed, 277 tests passed; statements 80.71%,
  branches 70.51%, functions 79.92%, lines 81.04%.
- `@mailmon/api typecheck`: passed with 0 warnings and 0 errors.
- `pnpm format:check`: passed; 9 tasks successful.
