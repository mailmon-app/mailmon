# Plan: Remaining Antithesis-Informed Testing Work

> Current date: 2026-05-18
> Primary sources: `docs/testing-requirements.md`, `antithesis/scratchbook/`, current test/runtime harnesses.
> Reference context checked: local Hegel repo at `.repos/hegel`, local Effect repo at `.repos/effect`, and `effect-solutions` topics `testing`, `services-and-layers`, and `config`.

## Purpose

Mailmon already has the local Hegel/Vitest property baseline that the older Antithesis PBT plan asked for. The remaining testing work is now operational: prove that the composed API, worker, PostgreSQL, and deployed queue paths preserve Mailmon's durable state guarantees when provider calls fail, workers die, the database is impaired, Pub/Sub retries, and internal routes are under load.

This plan turns the remaining items from `docs/testing-requirements.md` and the Antithesis scratchbook failure-injection properties into executable work slices.

## Current State

Implemented and should be treated as baseline:

- Hegel PBT across `@mailmon/core`, `@mailmon/gmail`, and `@mailmon/db`, with package-local `test-hegel.ts` helpers and a scheduled/manual `.github/workflows/pbt-nightly.yml`.
- DB-backed state-machine PBT for mailbox leases, stale commits, cursor regression, atomic commits, idempotent snapshots, webhook claims, replay overlap/dispatch, pagination cursors, and Gmail history projection.
- PR-time coverage via `pnpm test:coverage`, excluding `**/*.pbt.test.ts`.
- Sandbox E2E in `apps/api/src/sandbox-e2e.test.ts` with real API and worker runtimes, local Gmail sandbox, local webhook receiver, hosted connect, normal sync, reconnect-required token revocation, webhook retry, duplicate incremental dispatch idempotency, and newest-first readback.
- Worker route tests in `apps/worker/src/server.test.ts` for local/GCP request decoding, internal auth, retryable sync error propagation, dead-letter handling, and webhook route behavior.

Still missing:

- Provider-side Gmail failure E2E through the real worker HTTP boundary for `429`, quota-style `403`, transient `503`, and expired history cursors.
- A process-level chaos harness for killing or pausing a worker during `runMailboxSync` and proving lease expiry plus takeover.
- PostgreSQL impairment tests using a real fault boundary such as Toxiproxy.
- Automated deployed `gcp` transport validation for Pub/Sub retry/dead-letter redispatch.
- Repeatable load scenarios and numeric pass/fail budgets for `/internal/sync` and `/internal/webhook-deliveries`.

## Constraints And Non-Goals

- Do not add native Antithesis SDK assertions or claim `ANTITHESIS_OUTPUT_DIR` support until those APIs are actually wired and verified. The local Hegel source has internal Antithesis-style output plumbing, but the public package currently used by the repo is Vitest-oriented.
- Do not add Bombadil for docs or marketing. Revisit it only after there is a real product web interface with operational workflows worth browser exploration.
- Keep new workflows transport-neutral in `@mailmon/core` where possible. Use DB-backed or runtime-level tests only where durable transactions, process boundaries, or deployed transports are the property.
- For Effect code, keep following the repo pattern: services and layers for swappable dependencies, `@effect/vitest` for Effect tests, scoped resources for cleanup, and test-specific layers/config rather than ad hoc constructors.
- Keep generated and chaos scenarios small enough to diagnose. Operational tests should favor a few targeted failure families over broad random fault soup.

## Phase 1: Provider-Failure Sandbox E2E

Property: `provider-failure-e2e-preserves-operational-state`

Goal: extend the existing sandbox E2E composition so Gmail provider failures are exercised through the real API runtime, worker HTTP runtime, Gmail HTTP provider, and PostgreSQL persistence.

Implementation steps:

1. Extract the in-file Gmail sandbox helpers from `apps/api/src/sandbox-e2e.test.ts` into reusable test helpers if the file becomes unwieldy. Keep the first refactor mechanical.
2. Add controllable Gmail fault modes to the sandbox:
   - Gmail API calls return quota-style `403` with a rate-limit reason
   - Gmail message/history/profile calls return `429`
   - Gmail message/history/profile calls return transient `503`
   - `/gmail/v1/users/me/history` returns `404` for an expired cursor
3. Add E2E cases that connect a mailbox, seed a known cursor/state, trigger `/internal/sync`, and assert:
   - worker HTTP response preserves retryability with non-`2xx` where appropriate
   - mailbox cursor and canonical message/thread/event rows are unchanged on failed provider calls
   - mailbox operational state and `lastErrorCode` match the policy in `packages/core/src/mailbox-operational-state.ts`
   - expired history cursor produces lagging/repairable state without partial canonical mutation
4. Decide lane placement after runtime is measured:
   - keep a small provider-failure smoke matrix in PR-time coverage if stable under the existing 15 minute CI budget
   - move the full matrix to nightly/release if it pushes PR-time coverage too hard

Primary files:

- `apps/api/src/sandbox-e2e.test.ts`
- possible helper: `apps/api/src/sandbox-test-harness.ts`
- `packages/gmail/src/http-api.ts`
- `packages/gmail/src/sync-workflows.ts`
- `packages/core/src/mailbox-operational-state.ts`
- `.github/workflows/ci.yml`
- possible new workflow: `.github/workflows/sandbox-nightly.yml`

Acceptance criteria:

- Each required provider failure family has one full-runtime test.
- No provider failure test advances the mailbox cursor or emits mailbox events unless the sync actually succeeds.
- Retryable provider failures remain retryable across the worker HTTP boundary.
- The test names include the property slug or a clear sub-slug.

Verification:

```bash
pnpm exec vitest run apps/api/src/sandbox-e2e.test.ts
pnpm test:coverage
```

## Phase 2: Test-Time Lease Tuning

Properties: `worker-death-lease-expiry-takeover`, `mailbox-lease-single-flight`, `lease-loss-prevents-stale-commit`

Goal: make worker-death tests practical without waiting for the production 90 second mailbox lease TTL.

Implementation steps:

1. Introduce a small sync lease timing config surface instead of hard-coded constants in `packages/core/src/mailbox-sync-execution.ts`.
2. Preserve production defaults:
   - lease TTL: `90_000ms`
   - heartbeat interval: `30_000ms`
3. Provide test-specific values via an Effect service/layer or explicit runtime config, following the repo's existing service/layer pattern.
4. Keep `runMailboxSync(mailboxId)` ergonomics intact for existing callers by providing the default layer at app runtime.
5. Update existing core and DB tests to provide shortened timings only where they need lease expiry or heartbeat behavior.

Primary files:

- `packages/core/src/mailbox-sync-execution.ts`
- `packages/core/src/services.ts`
- `apps/worker/src/runtime.ts`
- `packages/core/src/use-cases.test.ts`
- `packages/db/src/mailbox-sync-execution.pbt.test.ts`

Acceptance criteria:

- Existing tests do not wait on production lease intervals.
- Production runtime behavior remains unchanged unless explicit config is provided.
- Effect layer wiring remains centralized; no scattered environment reads inside domain workflow logic.

Verification:

```bash
pnpm --filter @mailmon/core test -- src/use-cases.test.ts src/mailbox-sync-execution.pbt.test.ts
pnpm --filter @mailmon/db test -- src/mailbox-sync-execution.pbt.test.ts src/mailbox-sync-commit.pbt.test.ts
pnpm typecheck
```

## Phase 3: Local Worker-Death Chaos Harness

Property: `worker-death-lease-expiry-takeover`

Goal: prove a real worker process can die mid-sync, leave an expiring lease, and allow a second worker to recover or complete without stale state corruption.

Implementation steps:

1. Add a local chaos harness that starts PostgreSQL, API, worker A, worker B, Gmail sandbox, and webhook receiver.
2. Prefer a scriptable Node harness over broad Docker Compose at first, because the existing sandbox E2E already starts real API/worker runtimes in process.
3. Add a test-only provider pause point after lease acquisition but before commit. The cleanest shape is a test harness hook in the Gmail sandbox/provider response path, not production-only branching inside core.
4. Start a sync on worker A, wait until the DB row shows an active lease and running sync run, then terminate or close worker A.
5. Wait for the shortened lease to expire.
6. Trigger recovery via the existing `/internal/control-jobs` `recover_stuck_syncs` path or direct redispatch through worker B.
7. Assert:
   - old lease is cleared or superseded
   - the original sync run records `lease_lost` or recovered failure state as designed
   - worker B completes the sync or records an explicit retryable failure
   - canonical state, cursor, sync run, and event rows are internally consistent

Primary files:

- possible new test: `apps/worker/src/worker-death-chaos.test.ts` or `apps/api/src/sandbox-chaos.test.ts`
- `apps/api/src/sandbox-e2e.test.ts` helpers or extracted harness
- `apps/worker/src/index.ts`
- `apps/worker/src/processor.ts`
- `packages/db/src/mailbox-repair.test.ts`
- `packages/core/src/mailbox-execution-recovery.ts`

Acceptance criteria:

- The test kills or closes an actual worker runtime, not only a fake service model.
- Takeover happens under shortened test lease timing without sleeps longer than a few seconds.
- A stale worker result cannot commit after ownership is lost.

Verification:

```bash
pnpm exec vitest run apps/worker/src/worker-death-chaos.test.ts
pnpm exec vitest run apps/api/src/sandbox-e2e.test.ts
```

## Phase 4: PostgreSQL Impairment Harness

Property: `postgres-impairment-does-not-partially-commit`

Goal: exercise Mailmon through a real database fault boundary and prove impaired operations leave either pre-operation state or complete valid post-operation state.

Implementation steps:

1. Add a Toxiproxy-backed test topology for DB impairment. Use a dedicated compose file or test script rather than changing the default `docker-compose.yml`.
2. Route worker/API database connections through the proxy while the admin/test setup connection can still create/drop isolated databases reliably.
3. Start with targeted scenarios:
   - latency or timeout during mailbox sync commit
   - dropped connection during mailbox sync commit
   - latency/drop during webhook claim
   - latency/drop during webhook finalize
4. For each scenario, snapshot durable state before the operation and assert post-failure state is either unchanged or a complete valid outcome.
5. Keep the oracle narrow: the property is not "every impaired request succeeds"; it is "failure is explicit and durable state is not partial."

Primary files:

- possible compose file: `docker-compose.test-faults.yml`
- possible script: `scripts/db-impairment-smoke.ts`
- possible tests: `packages/db/src/postgres-impairment.test.ts` or `apps/worker/src/db-impairment-chaos.test.ts`
- `packages/db/src/test-setup.ts`
- `packages/db/src/persistence/mailbox-sync-commit.ts`
- `packages/db/src/persistence/webhook-deliveries.ts`

Acceptance criteria:

- At least one sync commit impairment and one webhook impairment path are covered.
- Tests assert durable row consistency, not only returned errors.
- The fault harness cleans up containers/proxies and does not interfere with normal DB-backed tests.

Verification:

```bash
docker compose -f docker-compose.test-faults.yml up -d
pnpm exec vitest run packages/db/src/postgres-impairment.test.ts
docker compose -f docker-compose.test-faults.yml down -v
```

## Phase 5: Deployed Pub/Sub Retry And Dead-Letter Validation

Property: `deployed-pubsub-retries-redispatch-sync`

Goal: automate the deployed `gcp` transport behavior that local worker route tests can only approximate.

Implementation steps:

1. Keep this out of PR-time CI. It requires real GCP resources and should be workflow-dispatch or release/staging only.
2. Add a staging validation script that:
   - creates or selects a synthetic mailbox/workspace fixture
   - publishes a mailbox sync dispatch message to the configured Pub/Sub topic
   - forces a retryable worker response for the synthetic mailbox or points the worker at a deterministic failure fixture
   - waits for Pub/Sub retry and, where configured, dead-letter delivery
   - verifies `recordMailboxSyncDispatchExhausted` durable state when the dead-letter path is reached
3. Make cleanup explicit: synthetic mailbox, sync runs, and any temporary topics/subscriptions must be scoped by a unique run ID.
4. Add a manually triggered GitHub Actions workflow only after secrets, quotas, and cleanup ownership are decided.

Primary files:

- possible script: `scripts/staging-pubsub-retry-smoke.ts`
- possible workflow: `.github/workflows/staging-transport-smoke.yml`
- `apps/worker/src/server.test.ts`
- `packages/db/src/persistence/mailbox-sync-coordinator.ts`
- `packages/db/src/persistence/mailbox-sync-dispatch-exhaustion.test.ts`
- `infra/`
- `docs/staging-validation-guide.md`

Acceptance criteria:

- The validation proves real Pub/Sub retry or dead-letter behavior, not just local envelope decoding.
- It never uses customer data.
- It has a documented run ID and cleanup path.
- Failure output includes enough GCP resource names and mailbox IDs to investigate.

Verification:

```bash
pnpm build:libs
pnpm exec tsx scripts/staging-pubsub-retry-smoke.ts --run-id <run-id>
```

## Phase 6: Load And Backpressure Budgets

Property: `internal-route-load-maintains-backpressure`

Goal: add repeatable load scenarios with explicit budgets for the worker's internal sync and webhook routes.

Implementation steps:

1. Choose the runner: `k6` is a good first fit for HTTP route load, while Artillery is also acceptable if the team prefers a Node-native workflow.
2. Define initial beta budgets before enforcing:
   - p95 and p99 latency per route
   - allowed retryable `5xx` rate under induced contention
   - DB pool saturation threshold
   - max active lease contention rate for a fixed mailbox set
   - max in-flight webhook processing rows after the run settles
3. Add two scenarios:
   - `/internal/sync`: many requests across a small mailbox set to force lease contention and retry signaling
   - `/internal/webhook-deliveries`: many due deliveries across a small endpoint set to force claim contention and endpoint failure classification
4. Export metrics to JSON so CI or release checks can compare budgets without scraping logs.
5. Start as manual/nightly. Promote budget enforcement only after the first few runs establish realistic numbers.

Primary files:

- possible directory: `load/`
- possible scripts: `load/internal-sync.k6.js`, `load/webhook-deliveries.k6.js`
- possible runner wrapper: `scripts/run-load-smoke.sh`
- `apps/worker/src/server.ts`
- `packages/db/src/persistence/mailbox-observability-queries.ts`
- `packages/db/src/persistence/webhook-deliveries.ts`

Acceptance criteria:

- Load scenarios can run against local test topology and, later, staging.
- Results include latency, status code distribution, and route-specific contention counters.
- The first version reports budgets without blocking CI; enforcement is a separate decision.

Verification:

```bash
k6 run load/internal-sync.k6.js
k6 run load/webhook-deliveries.k6.js
```

## Phase 7: Keep The Hegel Lane Healthy

Property cluster: implemented backend PBT baseline

Goal: maintain the current Hegel coverage without mistaking it for the remaining operational work.

Implementation steps:

1. Keep `vitest.pbt.config.ts` as the PBT-only entrypoint.
2. Increase `PBT_TEST_CASES` in `.github/workflows/pbt-nightly.yml` only after runtime is stable.
3. Consider deduplicating the three package-local `test-hegel.ts` helpers only if they start to diverge. Do not create a production dependency for test-only convenience.
4. Add Hegel properties only when a new state-machine rule appears or when a failure-injection result identifies a shrinkable deterministic core.

Acceptance criteria:

- PBT failures remain diagnosable through `tc.note(...)`.
- Hegel cache remains configured in CI.
- New operational tests do not bloat the PR-time coverage lane by default.

Verification:

```bash
PBT_TEST_CASES=5 pnpm exec vitest run --config vitest.pbt.config.ts --reporter=dot
pnpm test:coverage
```

## Recommended Execution Order

1. Provider-failure sandbox E2E.
2. Test-time lease tuning.
3. Local worker-death chaos.
4. PostgreSQL impairment.
5. Load scenarios and initial budgets.
6. Deployed Pub/Sub retry/dead-letter validation.
7. Ongoing Hegel lane maintenance.

This order gets the fastest useful signal first. Provider failures fit the existing sandbox harness. Lease tuning then unblocks process-level chaos without long sleeps. DB impairment and load testing should follow once the runtime harness is stable. Deployed Pub/Sub validation is high value, but it depends on staging secrets, quotas, and cleanup ownership, so it should not block the local fault harness.

## Open Decisions

- Should the expanded provider-failure sandbox matrix stay in `pnpm test:coverage`, or move to a nightly/release workflow?
- Should the first chaos tier be implemented as in-process runtime orchestration, Docker Compose, or both?
- Should PostgreSQL impairment standardize on Toxiproxy, Postgres restart, or driver-level fault injection? Toxiproxy is the best first choice because it exercises a real network boundary.
- What are the initial p95/p99 latency, DB pool, and retryable error budgets for beta?
- Who owns staging Pub/Sub/Gmail fixture lifecycle, quotas, and cleanup?

## Done Definition

The remaining testing roadmap is complete when:

- Provider failure E2E covers the required Gmail fault families through the real worker boundary.
- A worker-death chaos test demonstrates lease expiry, takeover, and stale commit prevention with real runtime boundaries.
- A PostgreSQL impairment test demonstrates no partial durable state under at least sync commit and webhook claim/finalize faults.
- A staging/manual deployed transport test proves Pub/Sub retry or dead-letter handling with synthetic data.
- Load scenarios exist with recorded budgets and repeatable output.
- Hegel PBT remains scheduled/manual and healthy, but native Antithesis/Bombadil work remains deferred until the repo has platform access or a product UI target.
