# Mailmon Testing Requirements & Strategy

This document tracks the current Mailmon test baseline and the remaining work needed for launch-grade confidence.

The repo is no longer at the "mostly unit tests" stage. It already has meaningful coverage across core workflows, provider contracts, DB-backed persistence, and runtime adapters. The main gaps are now black-box end-to-end coverage and infrastructure-level failure testing.

## 1. Current Baseline

The following layers are already implemented and should be treated as the required foundation for future work:

- **API contract tests:** `apps/api/src/server.test.ts` exercises authenticated workspace-scoped HTTP behavior and request/response shaping.
- **Worker runtime contract tests:** `apps/worker/src/server.test.ts` exercises `/health`, `/internal/sync`, `/internal/gmail-push`, `/internal/webhook-deliveries`, and `/internal/control-jobs`, including local-mode bypass and GCP-mode internal auth rejection/verification.
- **Sandbox E2E matrix:** `apps/api/src/sandbox-e2e.test.ts` runs the hosted connect flow, a real worker runtime, DB-backed sync, durable event emission, webhook delivery, reconnect-required handling, webhook retry behavior, duplicate incremental dispatch idempotency, and newest-first readback against a stateful Gmail sandbox server plus a local webhook receiver.
- **Core workflow tests:** `packages/core/src/use-cases.test.ts` covers mailbox lease acquisition/skip behavior, reconnect-required transitions, lease heartbeat/loss, webhook retry scheduling, and stale completion handling.
- **Hegel property-based tests:** `*.pbt.test.ts` suites in `@mailmon/core`, `@mailmon/gmail`, and `@mailmon/db` cover shrinkable state-machine properties for mailbox sync, cursor safety, Gmail history compaction, webhook delivery, Replay dispatch, internal worker codecs, and pagination cursors.
- **Gmail provider contract tests:** `packages/gmail/src/index.test.ts` covers token refresh failures, rate-limit classification, incremental history handling, and snapshot shaping.
- **DB-backed integration tests:** `packages/db/src/read-model.test.ts`, `packages/db/src/mailbox-event-emission.test.ts`, `packages/db/src/webhook-delivery-runtime.test.ts`, `packages/db/src/gmail-credentials.test.ts`, and related suites exercise real PostgreSQL migrations, pagination/index behavior, transactional sync finalization, event durability, webhook recovery, and reconnect-required persistence.
- **Queue/runtime adapter tests:** `packages/queue/src/index.test.ts` covers local async dispatch, GCP Pub/Sub mailbox sync publishing, delayed local webhook scheduling, worker HTTP adapters, and Cloud Tasks task creation/idempotency.

## 2. Contract And Resilience Coverage

The following contract-level scenarios are now part of the expected baseline and should not regress:

- Gmail `invalid_grant` transitions the Mailbox into `reconnect_required`.
- Gmail rate-limit responses (`429` and quota-style `403`) surface retryable provider problems.
- Gmail `503 Service Unavailable` responses surface retryable provider problems.
- Mailbox lease contention records `skipped_due_to_active_lease`.
- Lease heartbeat failures record `lease_lost` and stop sync finalization.
- Webhook deliveries retry on timeout and `5xx`, and stop retrying after `DEFAULT_WEBHOOK_DELIVERY_MAX_ATTEMPTS`.
- Internal worker HTTP routes preserve retry signals by returning non-`2xx` responses when sync or delivery processing fails.
- Internal worker HTTP routes reject unauthenticated `gcp` requests before request validation or execution.

These scenarios are covered today by the existing test suites and should stay in the normal PR-time test path.

## 3. CI/CD Enforcement

The enforced CI baseline for this repo is:

- run install, build, lint, typecheck, format checks, and tests on every push and pull request
- run DB-backed tests against a real PostgreSQL service container
- run the DB Vitest project with file-level parallelism disabled so generated PostgreSQL suites do not race each other
- generate coverage via `@vitest/coverage-v8`
- enforce practical global thresholds plus stricter thresholds for the most critical workflow files
- publish coverage artifacts for inspection
- cache `~/.cache/hegel` in CI so Hegel's private `uv` install does not become a cold-start source of noise

CI currently runs `pnpm test:coverage`, which executes the normal Vitest project graph with `**/*.pbt.test.ts` excluded. The PR-time coverage lane therefore covers API contracts, worker runtime behavior, sandbox E2E, DB-backed integration tests, Gmail provider contracts, queue/runtime adapter tests, and non-PBT core workflow tests, but not Hegel property tests.

Hegel PBT is enforced through the scheduled/manual `PBT Nightly` workflow. That workflow currently uses a PostgreSQL service container, builds the shared libraries, sets `PBT_TEST_CASES=10`, and runs `vitest.pbt.config.ts` in several explicit include groups:

- core and Gmail PBT
- DB mailbox sync commit PBT
- DB webhook and Replay PBT
- DB execution and mapper PBT

For local/manual expansion, prefer `PBT_TEST_CASES=<n> pnpm exec vitest run --config vitest.pbt.config.ts`. The root `pnpm test:pbt` script is a convenience filter over the `@mailmon/core`, `@mailmon/gmail`, and `@mailmon/db` package tests; because those package configs include all `src/**/*.test.ts`, it runs both PBT and non-PBT tests in those packages.

CI does not require Antithesis platform access. Antithesis terminology in the scratchbook and plan is used for property semantics and future portability only; the executable backend lane is local Hegel through Vitest.

Follow-up work here should focus on tightening thresholds over time, not on introducing the baseline for the first time.

## 4. Remaining Required Work

The following areas are still missing and are the real testing roadmap from here.

### 4.1 End-to-End Sandbox Testing

**Current state:** the repo now has DB-backed sandbox E2E coverage using a stateful local Gmail sandbox server and the real API/worker runtime wiring. The suite covers the hosted connect happy path, refresh-token revocation to `reconnect_required`, local webhook retry after a `5xx`, duplicate incremental sync idempotency, and newest-first message reads after multiple incremental syncs.

**Still required:**

1. Add provider-side retry/failure E2E cases around Gmail `429`, quota-style `403`, transient `503`, and expired history cursor behavior through the real worker HTTP boundary.
2. Add a live external sandbox tier with dedicated Gmail accounts if launch requires validation against Google itself rather than only the local sandbox.
3. Run the heavier sandbox suite nightly and before releases rather than only on normal PR-time coverage runs.

### 4.2 Chaos Testing

**Objective:** Prove the deployed system recovers from runtime and infrastructure failures without corrupting canonical state.

**Still required:**

- Kill a worker during `runMailboxSync` and assert lease expiry plus successful takeover by another worker.
- Inject PostgreSQL latency and dropped connections with a proxy such as Toxiproxy.
- Verify that Pub/Sub retries eventually re-dispatch failed mailbox sync push requests in deployed environments.

### 4.3 Load And Performance Testing

**Objective:** Find concurrency, memory, and DB pool bottlenecks before staging traffic does it first.

**Still required:**

- Drive high concurrency against `/internal/sync` and `/internal/webhook-deliveries`.
- Measure Postgres pool pressure and lease acquisition contention under load.
- Add repeatable `k6` or `Artillery` scenarios and define pass/fail budgets.

### 4.4 Deterministic Simulation Testing

**Objective:** Use deterministic clocks plus property-based inputs to shake out rare state-machine bugs.

**Current state:** Hegel is the repo's property-based testing direction. The implemented local/Vitest lane uses package-local `test-hegel.ts` helpers, defaults to 40 generated cases for PR-time runs, clamps tiny or invalid `PBT_TEST_CASES` values to 5, and emits `tc.note(...)` diagnostics so shrunk failures include the relevant property slug and generated scenario family.

Implemented PBT coverage includes:

- mailbox sync commit safety: cursor regression rejection, stale lease no-op commits, atomic state/cursor/event commits, idempotent snapshot application, label normalization, and thread-summary recalculation
- mailbox single-flight execution through both core service models and DB-backed lease acquisition
- Gmail history and initial-sync delete-wins compaction, including multi-page deltas and disappearing changed messages
- Gmail push fanout as a wake-up-only service-boundary property
- webhook delivery scheduling, stable delivery IDs, exclusive/stale claims, retry delay classification, and terminal no-reschedule behavior
- Replay active-range overlap rejection plus single-claim dispatch/counting
- internal worker envelope codecs and public pagination cursor round-trips/rejection

Package-level `pnpm test` runs include PBT by default because package Vitest configs include `src/**/*.test.ts`, which includes `*.pbt.test.ts`. The CI coverage lane intentionally excludes PBT, while the scheduled/manual `PBT Nightly` workflow runs the PBT-only config with explicit include groups. Use `PBT_TEST_CASES=<n> pnpm exec vitest run --config vitest.pbt.config.ts` for manual PBT expansion.

Antithesis remains vocabulary and future portability for this lane until platform access, SDK assertions, and output plumbing exist in this repo. Do not add native Antithesis assertions or claim `ANTITHESIS_OUTPUT_DIR` support until those APIs are wired and verified.

**Still required:**

- Add a live/deployed failure-injection tier for worker death, PostgreSQL impairment, and queue retry behavior.
- Defer Bombadil until Mailmon has a product web interface worth browser fuzzing; do not spend this lane on docs or marketing-site fuzzing.
- Keep newly added state-machine tests transport-neutral where possible and DB-backed only where durable transaction/claim behavior is the property under test.

## 5. Recommended Execution Order

1. Add provider-side failure cases to the sandbox E2E harness and decide whether any heavier sandbox tier should move out of the PR-time coverage lane.
2. Add a first chaos suite around worker death and DB impairment.
3. Add repeatable load scenarios with explicit budgets.
4. Keep the Hegel PBT lane healthy in scheduled/manual runs and raise case counts when runtime budgets allow.

That sequence keeps the next effort focused on the highest-value missing confidence layers rather than over-investing in more unit coverage.
