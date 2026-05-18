---
sut_path: /home/satty/projects/mailmon-dev
commit: 8f544ea13a0afb0b16f13e221dca8e20f4e989ab
updated: 2026-05-17
external_references:
  - path: https://github.com/hegeldev/hegel-typescript
    why: User-requested TypeScript property-based testing client; inspected README and source at e58959ae567cf49aaddabe2e04a5819c8e6f6850.
  - path: /home/satty/projects/mailmon-dev/.repos/hegel
    why: Local Hegel source used to verify runner settings, shrinking diagnostics, and Antithesis-output limitations in version 0.2.2.
  - path: /home/satty/projects/mailmon-dev/.repos/effect
    why: Local Effect source consulted for @effect/vitest and Effect testing patterns.
  - path: https://github.com/antithesishq/bombadil
    why: User-requested browser/UI property-based testing tool; inspected README and manual at ad98c7b5c36c6889dd05db4f08034b48374dda4a.
  - path: https://antithesis.com/docs/properties_assertions/assertions/
    why: Assertion taxonomy and property semantics used to classify properties.
  - path: https://antithesis.com/docs/best_practices/sometimes_assertions/
    why: Guidance for reachability/liveness-style properties.
  - path: https://antithesis.com/docs/using_antithesis/sdk/
    why: SDK runtime behavior and future portability notes.
  - path: https://antithesis.com/docs/using_antithesis/sdk/define_test_properties/
    why: Test property definition and assertion cataloging context.
  - path: https://antithesis.com/docs/using_antithesis/sdk/javascript_sdk/
    why: TypeScript/JavaScript instrumentation constraints for future platform use.
  - path: https://antithesis.com/docs/best_practices/optimizing/
    why: Test-environment tuning guidance.
  - path: /home/satty/projects/mailmon-dev/docs/testing-requirements.md
    why: Target testing requirements document for this reanalysis.
  - path: /home/satty/projects/mailmon-dev/docs/launch-readiness.md
    why: Cross-check for current launch and verification claims.
  - path: /home/satty/projects/mailmon-dev/docs/staging-validation-guide.md
    why: Manual live validation scope for Cloud Tasks and Gmail push/watch production paths.
  - path: /home/satty/projects/mailmon-dev/plans/antithesis-pbt-implementation-plan.md
    why: Historical implementation plan used to identify what is now complete versus stale.
  - path: /home/satty/projects/mailmon-dev/plans/clouldflare-findings.md
    why: Independent plan noting chaos/load baselining as migration prerequisites.
---

# SUT Analysis

## Scope

Captured user scope:

> $antithesis-research figure out how to PBT this repo using hegel typescript client https://github.com/hegeldev/hegel-typescript and https://github.com/antithesishq/bombadil and important NOTE: i don't have access to antithesis platform (not a customer) just use the approprtiate skills and context form the repo do PBT well

This research treats Antithesis as vocabulary and future portability only. The actionable test plan is local/CI property-based testing using Hegel for TypeScript/Vitest. Bombadil is deferred until Mailmon has a product web interface worth browser fuzzing; it is not targeted at docs or marketing.

## Product And Architecture

Mailmon is Gmail-first sync infrastructure. Its primary guarantee is maintaining correct mailbox state over time under duplicate notifications, retries, worker failures, cursor invalidation, webhook endpoint failures, and replay. The core docs state four design rules that matter directly for PBT:

- Mailbox is the unit of work.
- Gmail push is only a wake-up; Gmail history is the source of truth.
- State is committed before cursor advancement.
- Durable events and webhook delivery are at-least-once.

The repo is an Effect-based TypeScript monorepo:

- `packages/core`: transport-neutral domain services and use cases.
- `packages/db`: PostgreSQL persistence adapters using Drizzle.
- `packages/gmail`: Gmail OAuth, sync, watch, history, projection, and token crypto adapters.
- `packages/queue`: local HTTP dispatch, Pub/Sub dispatch, and Cloud Tasks scheduling adapters.
- `apps/api`: public Hono HTTP API and OAuth callbacks.
- `apps/worker`: internal Hono worker API for sync, Gmail push, webhook delivery, dead letters, and control jobs.
- `apps/docs`: Mintlify docs. `apps/marketing` exists, but neither docs nor marketing are Bombadil targets for this plan.

## State Model

Durable state lives in PostgreSQL. Important tables in `packages/db/src/schema.ts`:

- `mailboxes`: cursor, operational status, watch state, active sync lease, and last error.
- `messages` and `threads`: canonical mailbox state with uniqueness on mailbox/provider IDs.
- `sync_runs`: execution history and cursor movement.
- `mailbox_events`: immutable event log.
- `webhook_deliveries`: at-least-once delivery attempts and retry state.
- `replays`: replay jobs and active time ranges.
- `webhook_endpoints` and `webhook_endpoint_subscriptions`: event routing state.
- `gmail_mailbox_credentials`: encrypted provider refresh tokens.

Key persistence boundaries:

- `applyMailboxSyncCommit` in `packages/db/src/persistence/mailbox-sync-commit.ts` is the commit boundary for canonical state, event emission, sync run completion, and cursor advancement.
- `createMailboxSyncCoordinatorLayer` in `packages/db/src/persistence/mailbox-sync-coordinator.ts` owns lease acquire/renew/release semantics.
- `createWebhookDeliveryStoreLayer` in `packages/db/src/persistence/webhook-deliveries.ts` owns delivery creation, claiming, stale processing recovery, and completion.
- `createReplayStoreLayer` in `packages/db/src/persistence/replays.ts` owns replay creation, overlap conflict handling, claiming, completion, and failure.

## Concurrency Model

The process model is Node.js with Effect fibers. Concurrency is mostly async I/O plus DB transactions:

- `runMailboxSync` starts a sync run, acquires a mailbox lease, races provider sync/commit work against a heartbeat fiber, and releases the lease in an `ensuring` finalizer.
- Lease protection is enforced again at DB commit time by checking active owner and expiration.
- `recoverStuckMailboxSyncExecutions` scans expired active leases and re-dispatches work with `Effect.forEach(..., { concurrency: 10 })`.
- `dispatchReplays` claims queued replay jobs with concurrency 10.
- `prepareWebhookDeliveryAttempt` atomically claims pending or stale processing deliveries.
- Local async transport schedules delayed webhook dispatch with `setTimeout`, which is useful but less deterministic than core use-case tests.

PBT should generate interleavings at the service boundary and DB boundary rather than trying to fuzz all Node scheduling directly.

## Existing Test Strategy

The current suite already has useful example-based and integration coverage:

- Core workflow tests in `packages/core/src/use-cases.test.ts`.
- DB-backed sync/event tests in `packages/db/src/mailbox-event-emission.test.ts`.
- DB-backed webhook delivery lifecycle tests in `packages/db/src/webhook-delivery-runtime.test.ts`.
- Gmail provider contract tests in `packages/gmail/src/index.test.ts`.
- Sandbox E2E in `apps/api/src/sandbox-e2e.test.ts`.
- Worker route tests in `apps/worker/src/server.test.ts`.

`docs/testing-requirements.md` now treats the local Hegel/Vitest lane as implemented baseline, not future work. The current executable test surface has moved beyond the original plan:

- CI coverage runs `pnpm test:coverage`, excluding `**/*.pbt.test.ts`.
- Scheduled/manual `PBT Nightly` runs `vitest.pbt.config.ts` with grouped includes and `PBT_TEST_CASES=10`.
- Hegel PBT exists across `@mailmon/core`, `@mailmon/gmail`, and `@mailmon/db`.
- Local verification on this pass showed `pnpm test:coverage` passing 28 test files / 265 tests and `PBT_TEST_CASES=5 pnpm exec vitest run --config vitest.pbt.config.ts --reporter=dot` passing 11 PBT files / 32 tests.

The remaining testing requirements are no longer "write core PBT." They are higher-level fault and operations properties:

- provider-side failure E2E through the real worker boundary for Gmail `429`, quota-style `403`, transient `503`, and expired history cursors
- live/deployed worker-death recovery where lease expiry allows takeover without corrupting canonical state
- PostgreSQL impairment handling under latency and dropped connections
- Pub/Sub retry/dead-letter behavior in deployed `gcp` mode
- repeatable load tests for `/internal/sync` and `/internal/webhook-deliveries`
- optional live Gmail sandbox validation with dedicated test accounts

## Hegel Fit

Hegel is a good match for this repo because it:

- Runs inside Vitest with `hegel.test` and `hegel.testAsync`.
- Has async test support for Effect programs and DB-backed tests.
- Provides generators for primitive, collection, record, composite, optional, one-of, text, email, domain, URL, date/time, and binary values.
- Shrinks counterexamples and supports `tc.note` for final replay diagnostics.
- Has internal Antithesis-style `sdk.jsonl` output when `ANTITHESIS_OUTPUT_DIR` and `.testLocation(...)` are used, but Hegel 0.2.2 does not expose that builder through the package root. Treat this as future portability context, not current instrumentation.

Recommended local pattern:

- Put fast pure properties in `packages/core/src/*.pbt.test.ts` and `packages/gmail/src/*.pbt.test.ts`.
- Put DB-backed state-machine properties in `packages/db/src/*.pbt.test.ts` using the existing isolated PostgreSQL harness.
- Keep generated scenario sizes small by default, then increase `testCases` in nightly CI.
- Prefer generated operation sequences over ad hoc random loops so Hegel can shrink failures.

## Bombadil Fit

Bombadil is useful, but not for the core backend guarantees. It explores web UIs from a browser, using TypeScript specifications with `extract`, `actions`, `always`, `eventually`, `next`, and default properties for uncaught exceptions, promise rejections, console errors, and HTTP error responses.

For Mailmon, Bombadil should be deferred:

- Do not run it against `apps/docs`; docs navigation is not the next product risk.
- Do not run it against `apps/marketing`; marketing is not expected to become the browser-PBT target for this roadmap.
- Revisit Bombadil only when there is a real product web interface with authenticated or operational workflows that benefit from browser exploration.

Do not use Bombadil as a substitute for Hegel tests over `@mailmon/core`, `@mailmon/db`, and `@mailmon/gmail`.

## Failure-Prone Areas

- Lease contention and stale lease commit prevention.
- Cursor regression, especially mixed numeric and provider-like cursor formats.
- Atomicity of canonical state, event emission, sync run completion, and cursor advancement.
- Gmail history compaction where add/update/delete events are out of order or duplicate.
- Initial sync catch-up where baseline messages race with history deltas.
- Thread summary recalculation after deletes.
- Stable event and delivery IDs under duplicate dispatch and replay.
- Webhook delivery retry schedules, stale processing recovery, and endpoint health transitions.
- Replay overlap conflicts under concurrent creates.
- Internal worker route payload decoding for direct, Pub/Sub, and dead-letter payloads.
- Pagination cursor round trips and invalid cursor rejection.
- Provider failure translation at the full API/worker/Gmail boundary, especially rate limits and invalid history cursor repair.
- Worker process death during active sync after provider work but before or during DB commit.
- PostgreSQL impairment that can surface as connection drops, slow transactions, or pool exhaustion.
- Deployed transport retries where Pub/Sub and Cloud Tasks invoke internal worker routes with OIDC authentication.
- Load-induced contention across mailbox leases, DB pools, and webhook delivery claims.

## Assumptions

- The PBT implementation should not require Antithesis platform access.
- Hegel has been added as a dev dependency in `@mailmon/core`, `@mailmon/gmail`, and `@mailmon/db` in the current uncommitted worktree.
- Bombadil should be added only for a future product web interface, not backend properties, docs, or marketing.
- DB-backed properties can reuse `withIsolatedDatabasePromise` / `withIsolatedDatabaseEffect`.
- Current testing-requirements analysis is scoped to local `docs/` and `plans/` references only, per the user's answer.

## Open Questions

- Should the sandbox E2E suite stay in `pnpm test:coverage`, or should a heavier provider-failure matrix move to a separate nightly/release lane?
- What deployed environment should own the first chaos tier: local Docker Compose with fault proxies, staging GCP, or future Antithesis topology?
