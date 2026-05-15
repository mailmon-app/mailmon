---
sut_path: /home/satty/projects/mailmon-dev
commit: a4771cd562e5e48b412528096145a598a04de828
updated: 2026-05-16
external_references:
  - path: https://github.com/hegeldev/hegel-typescript
    why: User-requested TypeScript property-based testing client; inspected README and source at e58959ae567cf49aaddabe2e04a5819c8e6f6850.
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
---

# SUT Analysis

## Scope

Captured user scope:

> $antithesis-research figure out how to PBT this repo using hegel typescript client https://github.com/hegeldev/hegel-typescript and https://github.com/antithesishq/bombadil and important NOTE: i don't have access to antithesis platform (not a customer) just use the approprtiate skills and context form the repo do PBT well

This research treats Antithesis as vocabulary and future portability only. The actionable test plan is local/CI property-based testing using Hegel for TypeScript/Vitest and Bombadil for browser-facing docs/marketing surfaces.

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
- `apps/docs`: Mintlify docs. `apps/marketing` also exists in the worktree but is currently untracked.

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

The repo docs explicitly list deterministic simulation/PBT as remaining work: concurrent mailbox sync contention and randomized out-of-order Gmail history sequences. This catalog expands that into a concrete Hegel-first property set.

## Hegel Fit

Hegel is a good match for this repo because it:

- Runs inside Vitest with `hegel.test` and `hegel.testAsync`.
- Has async test support for Effect programs and DB-backed tests.
- Provides generators for primitive, collection, record, composite, optional, one-of, text, email, domain, URL, date/time, and binary values.
- Shrinks counterexamples and supports `tc.note` for final replay diagnostics.
- Emits Antithesis-style `sdk.jsonl` assertions when `ANTITHESIS_OUTPUT_DIR` and `.testLocation(...)` are used, which keeps tests portable if platform access appears later.

Recommended local pattern:

- Put fast pure properties in `packages/core/src/*.pbt.test.ts` and `packages/gmail/src/*.pbt.test.ts`.
- Put DB-backed state-machine properties in `packages/db/src/*.pbt.test.ts` using the existing isolated PostgreSQL harness.
- Keep generated scenario sizes small by default, then increase `testCases` in nightly CI.
- Prefer generated operation sequences over ad hoc random loops so Hegel can shrink failures.

## Bombadil Fit

Bombadil is useful, but not for the core backend guarantees. It explores web UIs from a browser, using TypeScript specifications with `extract`, `actions`, `always`, `eventually`, `next`, and default properties for uncaught exceptions, promise rejections, console errors, and HTTP error responses.

For Mailmon, Bombadil should be secondary:

- Run it against `apps/docs` once Mintlify can be started locally.
- Optionally run it against `apps/marketing` after that app is committed and considered in scope.
- Use it to catch broken docs navigation, API reference route errors, console errors, and regressions in the integration path copy.

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

## Assumptions

- The PBT implementation should not require Antithesis platform access.
- Hegel should be added as a dev dependency only when implementation starts.
- Bombadil should be added only for browser-facing specs, not backend properties.
- DB-backed properties can reuse `withIsolatedDatabasePromise` / `withIsolatedDatabaseEffect`.
- The untracked `apps/marketing` app is treated as optional until committed.

## Open Questions

- None for research. Implementation should decide CI split between PR-time small `testCases` and nightly larger `testCases`.
