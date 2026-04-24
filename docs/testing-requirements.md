# Mailmon Testing Requirements & Strategy

This document tracks the current Mailmon test baseline and the remaining work needed for launch-grade confidence.

The repo is no longer at the "mostly unit tests" stage. It already has meaningful coverage across core workflows, provider contracts, DB-backed persistence, and runtime adapters. The main gaps are now black-box end-to-end coverage and infrastructure-level failure testing.

## 1. Current Baseline

The following layers are already implemented and should be treated as the required foundation for future work:

- **API contract tests:** `apps/api/src/server.test.ts` exercises authenticated workspace-scoped HTTP behavior and request/response shaping.
- **Worker runtime contract tests:** `apps/worker/src/server.test.ts` exercises `/health`, `/internal/sync`, `/internal/gmail-push`, `/internal/webhook-deliveries`, and `/internal/control-jobs`.
- **Sandbox E2E happy path:** `apps/api/src/sandbox-e2e.test.ts` runs the hosted connect flow, a real worker runtime, DB-backed sync, durable event emission, and webhook delivery against a stateful Gmail sandbox server plus a local webhook receiver.
- **Core workflow tests:** `packages/core/src/use-cases.test.ts` covers mailbox lease acquisition/skip behavior, reconnect-required transitions, lease heartbeat/loss, webhook retry scheduling, and stale completion handling.
- **Gmail provider contract tests:** `packages/gmail/src/index.test.ts` covers token refresh failures, rate-limit classification, incremental history handling, and snapshot shaping.
- **DB-backed integration tests:** `packages/db/src/read-model.test.ts`, `packages/db/src/mailbox-event-emission.test.ts`, `packages/db/src/webhook-delivery-runtime.test.ts`, `packages/db/src/gmail-credentials.test.ts`, and related suites exercise real PostgreSQL migrations, pagination/index behavior, transactional sync finalization, event durability, webhook recovery, and reconnect-required persistence.
- **Queue/runtime adapter tests:** `packages/queue/src/index.test.ts` covers local async dispatch, delayed local webhook scheduling, worker HTTP adapters, and Cloud Tasks task creation/idempotency.

## 2. Contract And Resilience Coverage

The following contract-level scenarios are now part of the expected baseline and should not regress:

- Gmail `invalid_grant` transitions the Mailbox into `reconnect_required`.
- Gmail rate-limit responses (`429` and quota-style `403`) surface retryable provider problems.
- Gmail `503 Service Unavailable` responses surface retryable provider problems.
- Mailbox lease contention records `skipped_due_to_active_lease`.
- Lease heartbeat failures record `lease_lost` and stop sync finalization.
- Webhook deliveries retry on timeout and `5xx`, and stop retrying after `DEFAULT_WEBHOOK_DELIVERY_MAX_ATTEMPTS`.
- Internal worker HTTP routes preserve retry signals by returning non-`2xx` responses when sync or delivery processing fails.

These scenarios are covered today by the existing test suites and should stay in the normal PR-time test path.

## 3. CI/CD Enforcement

The minimum CI baseline for this repo is:

- run install, build, lint, typecheck, format checks, and tests on every push and pull request
- run DB-backed tests against a real PostgreSQL service container
- generate coverage via `@vitest/coverage-v8`
- enforce practical global thresholds plus stricter thresholds for the most critical workflow files
- publish coverage artifacts for inspection

Follow-up work here should focus on tightening thresholds over time, not on introducing the baseline for the first time.

## 4. Remaining Required Work

The following areas are still missing and are the real testing roadmap from here.

### 4.1 End-to-End Sandbox Testing

**Current state:** the repo now has one DB-backed sandbox E2E happy path using a stateful local Gmail sandbox server and the real API/worker runtime wiring.

**Still required:**

1. Expand from the single happy path into a small E2E matrix covering reconnect, retry, and incremental ordering behavior.
2. Add a live external sandbox tier with dedicated Gmail accounts if launch requires validation against Google itself rather than only the local sandbox.
3. Run the heavier sandbox suite nightly and before releases rather than only on normal PR-time coverage runs.

### 4.2 Chaos Testing

**Objective:** Prove the deployed system recovers from runtime and infrastructure failures without corrupting canonical state.

**Still required:**

- Kill a worker during `runMailboxSync` and assert lease expiry plus successful takeover by another worker.
- Inject PostgreSQL latency and dropped connections with a proxy such as Toxiproxy.
- Verify that transport-level retries eventually re-dispatch failed worker HTTP requests in deployed environments.

### 4.3 Load And Performance Testing

**Objective:** Find concurrency, memory, and DB pool bottlenecks before staging traffic does it first.

**Still required:**

- Drive high concurrency against `/internal/sync` and `/internal/webhook-deliveries`.
- Measure Postgres pool pressure and lease acquisition contention under load.
- Add repeatable `k6` or `Artillery` scenarios and define pass/fail budgets.

### 4.4 Deterministic Simulation Testing

**Objective:** Use deterministic clocks plus property-based inputs to shake out rare state-machine bugs.

**Still required:**

- Add `fast-check`-driven concurrent Mailbox sync contention scenarios on the same `mailboxId`.
- Add randomized out-of-order Gmail history sequences and assert eventual canonical-state convergence.
- Keep these tests transport-neutral and centered on `@mailmon/core` plus DB-backed finalization boundaries.

## 5. Recommended Execution Order

1. Build and stabilize the sandbox E2E harness.
2. Add a first chaos suite around worker death and DB impairment.
3. Add repeatable load scenarios with explicit budgets.
4. Add property-based DST for lease contention and history ordering.

That sequence keeps the next effort focused on the highest-value missing confidence layers rather than over-investing in more unit coverage.
