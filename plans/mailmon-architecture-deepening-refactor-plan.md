# Plan: Mailmon Architecture Deepening Refactors

> Source PRD: `docs/PRD.md`
> Active product plan: `plans/mailmon-gmail-sync-infrastructure.md`
> Completed migration record: `plans/archive/migration/2026-05-11-effect-v4-migration-plan.md`
> Domain language: `UBIQUITOUS_LANGUAGE.md`
> Effect references consulted: `effect-solutions` and `.repos/effect`

## Purpose

This plan captures post-Effect-v4 refactors that deepen existing Modules without changing
Mailmon's product roadmap or public product semantics.

The Effect v4 migration is complete for build and test health. Architecture work should no
longer be framed as "finish the migration". It should now be framed as increasing
locality and leverage around the highest-risk Mailbox workflows:

- Cursor-safe Canonical Mailbox State commits.
- Mailbox Status, Sync State, Watch State, and Last Error transitions.
- Gmail Initial Sync and Incremental Sync.
- Durable Mailbox Event creation and Webhook Delivery scheduling.
- Worker internal HTTP transport handling.
- Webhook Delivery signing and dispatch fidelity.
- Public HTTP adapter contract generation.
- Test harness depth for Workspace, Mailbox, Connect Session, Replay, and Webhook
  Delivery flows.

This plan does not replace or duplicate `plans/mailmon-gmail-sync-infrastructure.md`.
That product plan is complete through the local, GCP, replay, and CLI infrastructure phases.
This plan is the follow-up architecture hardening path.

## What Changed After The Effect v4 Migration

The previous version of this plan still assumed some migration-era uncertainty. That is no
longer the correct baseline.

The current repo uses:

- `Context.Service` for service seams in `@mailmon/core`, `@mailmon/config`,
  `@mailmon/gmail`, `@mailmon/db`, `@mailmon/queue`, and `apps/worker`.
- v4 `Schema.Literals([...])`, `Schema.Union([...])`, and
  `Schema.UnknownFromJsonString` in core contracts and internal codecs.
- v4 `Config` values plus `ConfigProvider.fromUnknown(...)` in config tests.
- `ManagedRuntime` as the bridge from Hono, worker startup, tests, and CLI commands into
  Effect programs.
- `Effect.catch(...)`, `Effect.catchCause(...)`, and `Cause.hasInterruptsOnly(...)`
  in migrated workflow code.
- `Option.fromNullishOr(...)` in DB persistence paths that previously needed v3
  `Option.fromNullable`.

The stale v3 migration pattern grep is clean except for a false-positive method name:

```bash
rg -n "Context\\.Tag|Effect\\.Tag|Effect\\.Service|Context\\.GenericTag|withConfigProvider|ConfigProvider\\.fromJson|Config\\.validate|Schema\\.standardSchemaV1|Schema\\.parseJson|Effect\\.runtime|Runtime\\.runPromise|Effect\\.zipRight|Effect\\.catchAll\\b|Effect\\.catchAllCause\\b|Option\\.fromNullable|Layer\\.unwrapEffect|Layer\\.scoped|Cause\\.isInterruptedOnly|Schema\\.filter\\(|Schema\\.int\\(|Schema\\.between\\(" packages apps
```

Current result:

- `apps/cli/src/app.ts:603` contains `dispatchRuntime.runPromise(...)` inside
  `Effect.promise(...)`.
- This is not `Runtime.runPromise` from Effect v3. It is a `ManagedRuntime` method call and
  should not be treated as a migration blocker.

## Command Evidence From This Revision

Commands run during this revision:

```bash
pnpm exec effect-solutions list
pnpm exec effect-solutions show basics services-and-layers error-handling testing config data-modeling
npx fallow dead-code
npx fallow dupes
npx fallow health
pnpm build
pnpm lint
pnpm typecheck
pnpm test
pnpm format:check
pnpm db:generate
```

Workspace command results:

| Command             | Result               | Notes                                                                       |
| ------------------- | -------------------- | --------------------------------------------------------------------------- |
| `pnpm build`        | Passes               | Turbo replayed cached successful package builds.                            |
| `pnpm lint`         | Passes with warnings | 2 warnings in API, 2 warnings in worker tests.                              |
| `pnpm typecheck`    | Passes with warnings | Same 4 oxlint-tsgolint warnings as lint.                                    |
| `pnpm test`         | Passes               | 223 tests pass across core, config, queue, gmail, db, API, CLI, and worker. |
| `pnpm format:check` | Fails                | Existing formatting drift in 5 migrated code files.                         |
| `pnpm db:generate`  | Passes               | Drizzle sees 14 tables and reports no schema changes.                       |

`pnpm lint` and `pnpm typecheck` residual warnings:

- `apps/api/src/server.ts:525`
  - `typescript(no-unnecessary-type-parameters)` on `jsonResponse`.
- `apps/api/src/server.ts:530`
  - `typescript(no-unsafe-type-assertion)` on `schema as never`.
- `apps/worker/src/processor.test.ts:131`
  - `typescript(no-unsafe-type-assertion)` on a sync-dead-letter runtime test double.
- `apps/worker/src/processor.test.ts:163`
  - `typescript(no-unsafe-type-assertion)` on a webhook-delivery runtime test double.

`pnpm format:check` existing failures:

- `packages/core/src/contracts.ts`
- `packages/core/src/mailbox-sync-execution.ts`
- `packages/core/src/use-cases.ts`
- `apps/worker/src/processor.ts`
- `apps/api/src/http/validation.ts`

Fallow results:

| Command                | Result                        | Notes                                                                                |
| ---------------------- | ----------------------------- | ------------------------------------------------------------------------------------ |
| `npx fallow dead-code` | Passes                        | No issues found; 82 entry points detected.                                           |
| `npx fallow dupes`     | Reports duplication           | 2,061 duplicated lines, 7.1 percent, 36 clone groups, 7 clone families.              |
| `npx fallow health`    | Fails threshold intentionally | Health score `76 B`; deductions from hotspots, unit size, duplication, and coupling. |

Highest `fallow health` refactoring targets:

- `packages/gmail/src/index.ts`
  - high-confidence target: extract `listHistoryDelta`.
  - `createHttpGmailApi` is 522 LOC.
  - `listHistoryDelta` has 18 cyclomatic complexity and 39 cognitive complexity.
- `apps/api/src/sandbox-e2e.test.ts`
  - high-confidence target: extract `server`.
  - sandbox server helper has 30 cyclomatic complexity and 39 cognitive complexity.

Other current hotspots:

- `packages/db/src/persistence.ts`
  - 4,012 LOC, top churn hotspot, contains many service adapters plus product policy.
- `packages/core/src/use-cases.ts`
  - 1,295 LOC, second churn hotspot, contains public workflows plus delivery
    classification.
- `apps/worker/src/server.ts`
  - 581 LOC, accelerating hotspot, repeats internal route interpretation shape.
- `apps/cli/src/app.ts`
  - 790 LOC, duplicates Webhook Delivery request-building behavior with worker runtime.
- `apps/api/src/server.ts`
  - 1,136 LOC, owns manual OpenAPI response schemas and Hono route definitions.

## Effect v4 Architecture Rules

Follow these rules for every slice in this plan.

1. Use `Context.Service` for real service seams.

   A service seam is real when behavior varies behind the same interface, when a test adapter
   needs to satisfy that interface, or when layer composition needs to wire an external
   adapter. Do not add `Context.Service` just to split a large file.

2. Prefer `yield* Service` in `Effect.gen` for service access.

   The Effect v4 service migration guide allows `Service.use(...)`, but it explicitly warns
   that `yield*` keeps dependencies easier to track. Existing Mailmon code already uses
   `yield* Service`; new workflow code should keep doing that unless a one-line accessor is
   materially clearer.

3. Keep service methods dependency-clean.

   Effect service method interfaces should return effects whose `R` is `never`. Dependencies
   belong in the `Layer.effect(...)` constructor, not in every method signature.

4. Use explicit layers.

   v4 removed the old `Effect.Service` dependency shorthand. Use `Layer.effect(...)`,
   `Layer.succeed(...)`, `Layer.mergeAll(...)`, `Layer.provide(...)`, and
   `Layer.provideMerge(...)` explicitly. Do not reintroduce `Default`/`Live` naming from v3.

5. Use `Effect.fn("Module.method")` for new effectful workflow Modules.

   This is especially useful when extracting core workflows, Gmail adapter operations, and DB
   transaction steps. It gives call-site tracing without widening the external interface.

6. Use v4 Schema constructors only.

   New schemas should use `Schema.Literals([...])`, `Schema.Union([...])`,
   `Schema.check(...)`, `Schema.refine(...)`, `Schema.UnknownFromJsonString`, and
   `Schema.fromJsonString(...)` as appropriate. Do not add v3 variants.

7. Use typed domain data where it increases leverage.

   For new public contracts or reusable domain values, prefer `Schema.Class` or precise
   schema-derived types. For internal failure variants that callers match on, consider
   `Schema.TaggedErrorClass`. Do not convert all existing plain interfaces just for style.

8. Keep `ManagedRuntime` at adapter edges.

   Hono handlers, worker startup, CLI commands, and selected tests may bridge with
   `ManagedRuntime`. Core workflows should remain Effect programs and service interfaces.

9. Do not import from `.repos/effect`.

   `.repos/effect` is local reference material only. Production code must import from the
   workspace dependencies.

10. Preserve local test isolation.

    Effect test guidance prefers fresh per-test layers unless a suite intentionally shares an
    expensive resource. Avoid global stateful test layers unless the suite owns the cleanup.

## Refactor Rules

Product and architecture invariants:

- Keep Mailbox as the unit of work.
- Keep Hono as the public HTTP adapter.
- Keep Gmail-specific behavior in `@mailmon/gmail`.
- Keep `@mailmon/core` free of Hono, Pub/Sub, Cloud Tasks, BullMQ, Drizzle, Postgres, and
  transport details.
- Preserve `MAILMON_ASYNC_TRANSPORT_MODE` behavior:
  - `local` uses local HTTP adapters.
  - `gcp` uses Pub/Sub for mailbox sync dispatch and Cloud Tasks for Webhook Delivery.
  - only the supported local and GCP modes are retained.
- Do not change public resource shapes without defining shared contracts in `@mailmon/core`
  first.
- Do not advance Cursor before durable Canonical Mailbox State writes.
- Do not schedule Webhook Delivery from inline sync network calls.
- Do schedule Webhook Delivery from durable Mailbox Event rows.
- Do not split a real adapter seam into a hypothetical seam that has only one adapter and no
  testing leverage.
- Internal seams are allowed inside a deep Module when they improve locality without widening
  the package interface.

Architecture vocabulary:

- A Module is any unit with an interface and implementation.
- The interface includes every invariant, error mode, ordering constraint, dependency, and
  config fact the caller must know.
- A deep Module gives callers leverage through a small interface.
- A shallow Module exposes nearly as much interface complexity as it hides implementation.
- A seam is where an interface lives.
- An adapter is a concrete implementation behind a seam.
- Locality means bugs, knowledge, and verification concentrate in one place.

## Current Architectural Friction

### Test harness duplication

Tests still carry too much runtime setup inside scenario bodies.

Current duplicate families include:

- 403 duplicated lines across `apps/api/src/server.test.ts` and
  `packages/core/src/use-cases.test.ts`.
- 90 duplicated lines in `apps/api/src/sandbox-e2e.test.ts`.
- 284 duplicated lines in `apps/worker/src/server.test.ts`.
- 141 duplicated lines inside `packages/core/src/use-cases.test.ts`.
- 168 duplicated lines in `packages/gmail/src/index.test.ts`.

The duplicated setup is a shallow Module. Tests must learn too much about unrelated layer
wiring before expressing the product behavior they verify.

### DB persistence monolith

`packages/db/src/persistence.ts` now benefits from v4 service seams, but the file still owns
too many adapter implementations and product policies:

- Workspace API key persistence.
- Mailbox catalog and query catalog adapters.
- Connect Session completion and Gmail credential persistence.
- Sync Run persistence.
- Mailbox lease acquisition, renewal, and release.
- Canonical Mailbox State commit transaction.
- Replay persistence.
- Webhook Endpoint, Subscription, Delivery, and recovery persistence.
- Mailbox repair, watch renewal, dispatch exhaustion, and execution recovery.
- Gmail credential audit and rewrap operator flows.
- Product wording for Mailbox Last Error transitions.

The external service interfaces in `@mailmon/core` are useful. The implementation file has
poor locality because unrelated adapter knowledge lives in one place.

### Gmail adapter depth

`packages/gmail/src/index.ts` remains the highest concrete refactor target.

`createHttpGmailApi` mixes:

- OAuth token refresh.
- Authorization code exchange.
- Gmail profile fetch.
- Gmail watch renewal.
- Gmail message fetch.
- Initial Sync full message listing.
- Gmail history listing.
- Incremental history compaction.
- rate-limit classification.
- reconnect-required classification.
- raw response parsing.

The external provider seams are already right:

- `MailboxSyncProvider`
- `MailboxWatchProvider`
- `MailboxConnectProvider`
- `GmailMailboxCredentialStore`
- `GmailRefreshTokenCipher`

The work now is to deepen implementation internals without exposing new package interfaces
unnecessarily.

### Operational state policy is scattered

Mailbox operational behavior currently spans core workflows and DB persistence:

- `packages/core/src/mailbox-sync-execution.ts` classifies terminal sync problems for Sync
  Run outcomes.
- `packages/db/src/persistence.ts` has `TERMINAL_GMAIL_CREDENTIAL_PROBLEM_CODES`.
- `packages/db/src/persistence.ts` has `getMailboxSyncFailureState`.
- `packages/db/src/persistence.ts` directly writes `mailbox_sync_dispatch_retry_exhausted`
  Last Error state.
- `packages/db/src/persistence.ts` directly mutates status/sync/watch state during watch
  renewal failures.
- Gmail credential rewrap operator flows embed reconnect-required wording.

This weakens locality. A product decision about Mailbox Status, Sync State, Watch State, or
Last Error should be testable without Postgres.

### Worker internal route interpretation repeats adapter control flow

`apps/worker/src/server.ts` repeats the same shape across internal routes:

1. read request body text.
2. parse JSON.
3. decode domain payload.
4. map decode errors to JSON responses.
5. get processors from `ManagedRuntime`.
6. call the selected processor.
7. map `ProblemDetails`.
8. map unknown failures to route-specific internal errors.

The route declarations should remain visible Hono adapter code, but repeated interpretation
should live behind one deeper Module.

### Webhook Delivery request building is duplicated

Worker runtime and CLI local forwarding duplicate:

- v4 Schema JSON string encoding.
- HMAC signature construction.
- `x-mailmon-*` headers.
- attempt metadata.
- transport failure classification.

The worker and CLI are separate adapters. The request-building format should not be separate.

### Public route contracts remain split

Public contracts are currently spread across:

- `packages/core/src/contracts.ts` TypeScript resource interfaces and selected Schemas.
- `apps/api/src/http/parsers.ts` request/query Schemas and alias normalization.
- `apps/api/src/server.ts` manual OpenAPI response schemas.
- `apps/api/src/generate-openapi.ts` OpenAPI post-processing.
- `apps/docs/api-reference/openapi.json` generated docs artifact.

The API has a public contract test, but route schemas still require edits in several Modules.
That is a shallow interface for public contract changes.

## Execution Order

Work in small slices. Each slice must leave the repo buildable and testable, except when a
slice explicitly begins by recording a failing regression test.

Recommended order:

1. Baseline hygiene after v4 migration.
2. Test harness deepening.
3. Webhook Delivery request-building Module.
4. Worker internal HTTP route interpreter.
5. Gmail adapter internals.
6. DB persistence adapter partition.
7. Mailbox operational state policy.
8. Canonical Mailbox State commit Module.
9. Public route contract Module.

Rationale:

- Start with verification hygiene so later failures are signal, not known noise.
- Reduce test setup duplication before correctness-sensitive refactors.
- Extract low-risk duplicated request-building and worker interpretation before touching sync
  commit logic.
- Deepen Gmail before moving deeper into DB commit behavior, because Gmail history handling is
  the current top fallow target.
- Partition DB adapters before the commit extraction so commit-specific diffs do not compete
  with unrelated persistence code.
- Move operational policy into core before final commit-module hardening.
- Leave public contract consolidation last because it can touch generated docs and public
  schema artifacts broadly.

---

## Slice 0: Baseline Hygiene After v4 Migration

### Files

- `packages/core/src/contracts.ts`
- `packages/core/src/mailbox-sync-execution.ts`
- `packages/core/src/use-cases.ts`
- `apps/worker/src/processor.ts`
- `apps/api/src/http/validation.ts`
- `apps/api/src/server.ts`
- `apps/worker/src/processor.test.ts`
- `plans/archive/migration/2026-05-11-effect-v4-migration-plan.md`
- `plans/mailmon-architecture-deepening-refactor-plan.md`

### Problem

The migration is functionally complete, but the current verification baseline contains known
noise:

- `pnpm format:check` fails on five code files.
- lint/typecheck pass with four warnings.
- the migration plan's "Current Status" section says the migration is complete, while its
  "Breakage Inventory" intentionally retains historical breakage details. That is useful as a
  record, but follow-up architecture work needs to avoid treating those historical sections as
  active tasks.

### Target Shape

The repo should have a clean baseline before deeper refactors:

- `pnpm format:check` passes.
- lint/typecheck warnings are either fixed or intentionally documented with narrow suppressions.
- future agents can distinguish migration-history notes from active architecture work.

### Steps

1. Format only the five files reported by `pnpm format:check`.
2. Re-run `pnpm format:check`.
3. Replace `apps/api/src/server.ts` `jsonResponse<TSchema>` with a non-generic helper or a
   narrow type that does not need `schema as never`.
4. Replace unsafe runtime casts in `apps/worker/src/processor.test.ts` with a typed test
   runtime helper:
   - `type ProcessorRuntime<T extends (...args: any) => any> = Parameters<T>[0]`.
   - helper returns the minimum `{ runPromise }` shape accepted by each processor factory.
5. Re-run `pnpm lint` and `pnpm typecheck`.
6. Add a short note to the migration plan if needed: historical breakage inventory is retained
   as execution record, not active work.

### Acceptance Criteria

- `pnpm build` passes.
- `pnpm lint` passes with zero warnings.
- `pnpm typecheck` passes with zero warnings.
- `pnpm format:check` passes.
- `pnpm test` passes.
- No product behavior changes.
- No generated DB migration appears after `pnpm db:generate`.

### Verification

```bash
pnpm build
pnpm lint
pnpm typecheck
pnpm test
pnpm format:check
pnpm db:generate
```

---

## Slice 1: Test Harness Deepening

### Files

- `apps/api/src/server.test.ts`
- `apps/api/src/sandbox-e2e.test.ts`
- `apps/api/src/http/handlers.test.ts`
- `apps/worker/src/server.test.ts`
- `packages/core/src/use-cases.test.ts`
- `packages/gmail/src/index.test.ts`
- possible package-local helpers next to these tests

### Problem

Tests duplicate Workspace, Mailbox, Webhook Endpoint, Subscription, Replay, Gmail response,
and runtime fixture setup. The duplication obscures behavior and makes future refactors more
dangerous because every test carries its own wiring vocabulary.

The deletion test says these helpers should exist: deleting a real harness would force layer,
runtime, and fixture complexity back into many test bodies.

### Target Shape

Create test harness Modules with behavior-centered interfaces:

- `createApiRouteTestRuntime(...)`
- `createWorkspaceAuthFixture(...)`
- `createMailboxFixture(...)`
- `createWebhookEndpointFixture(...)`
- `createReplayFixture(...)`
- `createSandboxRuntimeFixture(...)`
- `createWorkerInternalRequest(...)`
- `createGmailFetchMock(...)`
- `gmailHistoryPage(...)`
- `gmailMessage(...)`

Keep helpers package-local unless at least two packages need the same interface. Do not create a
global `@mailmon/test` package yet.

### Effect v4 Notes

- Prefer fresh `Layer.succeed(...)` or `Layer.sync(...)` per test.
- Keep `ManagedRuntime.make(...)` in the harness, not in each scenario body.
- If a test suite creates multiple runtime instances over the same expensive layer graph, only
  then consider a suite-local memo map. Do not add a global memo map by default.

### Steps

1. Extract the shared API/core Workspace and Mailbox fixture data first.
2. Extract API route runtime construction from `apps/api/src/server.test.ts`.
3. Extract `apps/api/src/http/handlers.test.ts` runtime helpers only if the interface matches
   `server.test.ts`; otherwise keep it separate.
4. Extract sandbox worker/API environment creation from `apps/api/src/sandbox-e2e.test.ts`.
5. Extract worker internal route request helpers from `apps/worker/src/server.test.ts`.
6. Extract Gmail response builders and provider invocation helpers from
   `packages/gmail/src/index.test.ts`.
7. Run `npx fallow dupes` and record the new duplicate percentage in this plan.

### Acceptance Criteria

- No product behavior changes.
- Tests still cover the same scenarios.
- Test names become easier to scan because setup noise moves behind harness Modules.
- `npx fallow dupes` drops below 7.1 percent.
- The 403-line API/core clone family is either removed or explicitly justified as not worth a
  shared helper yet.

### Verification

```bash
pnpm --filter @mailmon/api test
pnpm --filter @mailmon/worker test
pnpm --filter @mailmon/core test
pnpm --filter @mailmon/gmail test
npx fallow dupes
```

### Slice 1 Result

Completed on 2026-05-12.

- Added package-local API route, sandbox, worker internal HTTP, and Gmail HTTP test harness
  helpers without introducing a global `@mailmon/test` package.
- `npx fallow dupes` now reports 971 duplicated lines, 3.4 percent, 22 clone groups, and 3
  clone families.
- The previous 403-line API/core clone family is no longer present. The remaining API/core
  overlap is a 47-line fixture-shaped clone between `apps/api/src/test-harness.ts` and
  `packages/core/src/use-cases.test.ts`; keep it package-local for now because `@mailmon/core`
  does not export test utilities and only this slice needs the shared shape.
- Verification passed:
  `pnpm --filter @mailmon/api test`,
  `pnpm --filter @mailmon/worker test`,
  `pnpm --filter @mailmon/core test`,
  `pnpm --filter @mailmon/gmail test`,
  `pnpm build`,
  `pnpm lint`,
  `pnpm typecheck`,
  `pnpm test`,
  `pnpm format:check`, and
  `pnpm db:generate`.

---

## Slice 2: Webhook Delivery Request-Building Module

### Files

- `packages/core/src/services.ts`
- new `packages/core/src/webhook-delivery-request.ts`
- `packages/core/src/index.ts`
- `packages/core/src/use-cases.test.ts`
- `apps/worker/src/runtime.ts`
- `apps/worker/src/runtime.test.ts`
- `apps/cli/src/app.ts`
- `apps/cli/src/app.test.ts`

### Problem

Worker Webhook Delivery and CLI local forwarding duplicate request construction. This harms
locality because a signature-format change must be patched and tested in two adapters.

Duplicated behavior:

- JSON body encoding with `Schema.UnknownFromJsonString`.
- timestamp second derivation.
- HMAC signature construction.
- `x-mailmon-attempt`.
- `x-mailmon-delivery-id`.
- `x-mailmon-event-id`.
- `x-mailmon-signature`.
- transport failure classification.

### Target Shape

Create a core Module that owns the transport-neutral delivery request format:

- `buildWebhookDeliveryHttpRequest(...)`
- `createWebhookDeliverySignature(...)`
- `classifyWebhookDeliveryTransportFailure(...)`

Suggested interface:

```ts
export interface WebhookDeliveryHttpRequest {
  readonly body: string;
  readonly headers: Readonly<Record<string, string>>;
}

export const buildWebhookDeliveryHttpRequest = (params: {
  readonly delivery: PreparedWebhookDelivery;
  readonly attemptedAt: string;
  readonly userAgent: string;
}): WebhookDeliveryHttpRequest => ...
```

The worker and CLI remain separate adapters:

- worker owns timeout and abort handling.
- CLI owns local-forwarding target and CLI wording.
- core owns the canonical signature and Mailmon headers.

### Effect v4 Notes

- Use `Schema.encodeUnknownSync(Schema.UnknownFromJsonString)` for canonical JSON body encoding
  unless a stronger event schema is introduced in core first.
- Keep the builder pure if possible. It does not need a `Context.Service`.
- Do not add Cloud Tasks, Hono, or fetch details to core.

### Steps

1. Add a core unit test with fixed:
   - `attemptedAt`
   - signing secret
   - `PreparedWebhookDelivery`
   - expected body string
   - expected `x-mailmon-signature`
   - expected headers except adapter-specific `user-agent`
2. Extract signature and header construction into `@mailmon/core`.
3. Replace worker request construction with the shared builder.
4. Replace CLI local-forwarding request construction with the shared builder.
5. Keep timeout failure messages adapter-specific only where they differ:
   - worker: "endpoint responded"
   - CLI: "local endpoint responded"
6. Re-run worker and CLI tests.

### Acceptance Criteria

- Worker Webhook Delivery signatures remain unchanged.
- CLI replay/listen forwarded deliveries remain signature-compatible with worker delivery.
- The signature format has one direct test surface.
- `apps/worker/src/runtime.ts` and `apps/cli/src/app.ts` no longer duplicate body/header/signature
  construction.
- Core remains transport-neutral.

### Verification

```bash
pnpm --filter @mailmon/core test
pnpm --filter @mailmon/worker test -- src/runtime.test.ts
pnpm --filter @mailmon.dev/cli test -- src/app.test.ts
pnpm typecheck
```

---

## Slice 3: Worker Internal HTTP Route Interpreter

### Files

- `apps/worker/src/server.ts`
- new `apps/worker/src/internal-route-interpreter.ts`
- `apps/worker/src/server.test.ts`
- `packages/core/src/internal-message-codec.ts`

### Problem

Internal worker routes repeat control flow. This makes route-specific behavior hard to see and
increases the risk of uneven error mapping.

Routes involved:

- `POST /internal/sync`
- `POST /internal/sync-dead-letter`
- `POST /internal/gmail-push`
- `POST /internal/webhook-deliveries`
- `POST /internal/control-jobs`

### Target Shape

Create an internal route interpreter Module that accepts route-specific data:

- route name.
- decoder.
- processor selector.
- success status.
- invalid request response behavior.
- `ProblemDetails` response policy.
- unknown-error detail.
- optional precondition.

Suggested internal shape:

```ts
interface InternalRouteSpec<TRequest, TResult> {
  readonly name: string;
  readonly decode: (payload: unknown) => InternalMessageDecodeResult<TRequest>;
  readonly invalidRequest: (error: string) => Response | Promise<Response>;
  readonly selectProcessor: (
    processors: WorkerHttpProcessors,
  ) => (request: TRequest) => Promise<TResult>;
  readonly successStatus?: number;
  readonly problemStatus?: (problem: ProblemDetails) => number;
  readonly internalErrorDetail: string;
}
```

Keep Hono route declarations readable:

```ts
app.post("/internal/sync", interpretInternalRoute(syncRouteSpec, runtime));
```

### Effect v4 Notes

- `WorkerHttpProcessors` can stay a `Context.Service` because tests and the HTTP runtime use it
  as a real seam.
- `ManagedRuntime` should remain the adapter bridge.
- Do not move Hono-specific `context` objects into core.

### Steps

1. Add tests around current response behavior for:
   - invalid `/internal/sync`
   - invalid `/internal/sync-dead-letter`
   - invalid `/internal/gmail-push`
   - invalid `/internal/webhook-deliveries`
   - invalid `/internal/control-jobs`
   - processor-thrown `ProblemDetails`
   - processor-thrown unknown error
   - local-mode `/internal/gmail-push` precondition
2. Extract shared JSON body reading and response helpers.
3. Extract decode and invalid-request handling.
4. Extract processor lookup and execution.
5. Rebuild each route through the interpreter.
6. Keep dead-letter logging explicit in the dead-letter route spec.
7. Re-run `npx fallow dupes`.

### Acceptance Criteria

- Internal route response bodies and statuses stay stable.
- OIDC authorization behavior stays unchanged.
- Route-specific differences are data or small callbacks, not repeated control flow.
- `apps/worker/src/server.ts` route declarations become shorter and easier to scan.
- `apps/worker/src/server.test.ts` duplication drops.

### Verification

```bash
pnpm --filter @mailmon/worker test -- src/server.test.ts
pnpm --filter @mailmon/worker typecheck
npx fallow dupes
npx fallow health
```

---

## Slice 4: Gmail Adapter Internals

### Files

- `packages/gmail/src/index.ts`
- `packages/gmail/src/index.test.ts`
- possible new internal files:
  - `packages/gmail/src/http-client.ts`
  - `packages/gmail/src/problems.ts`
  - `packages/gmail/src/parsers.ts`
  - `packages/gmail/src/history.ts`
  - `packages/gmail/src/sync.ts`
  - `packages/gmail/src/watch.ts`
  - `packages/gmail/src/connect.ts`

### Problem

`createHttpGmailApi` is too broad. It is the top concrete refactor target and hides many
behaviors behind one local implementation body.

The external seams are already correct. The implementation internals are shallow because a
maintainer must understand token refresh, response parsing, pagination, compaction, watch
renewal, and connect authorization together.

### Target Shape

Keep public exports stable:

- `createAesGcmGmailRefreshTokenCipherLayer`
- `createStubMailboxSyncProviderLayer`
- `createHttpGmailWatchProviderLayer`
- `createHttpGmailConnectProviderLayer`
- `createHttpGmailSyncProviderLayer`
- `GmailRefreshTokenCipher`
- `GmailMailboxCredentialStore`

Deepen internals behind package-private Modules:

- Gmail HTTP client helper:
  - owns URL construction.
  - owns auth header.
  - owns JSON response parsing.
  - classifies rate limit where response status/body are known.
- Gmail OAuth Module:
  - token refresh.
  - authorization code exchange.
  - reconnect-required token payload classification.
- Gmail parser Module:
  - profile parser.
  - connect profile parser.
  - watch response parser.
  - list messages response parser.
  - message response parser.
  - history list response parser.
- Gmail history Module:
  - paginated history reader.
  - history compaction.
  - changed/deleted Message ID sets.
- Gmail sync assembly Module:
  - Initial Sync flow.
  - Incremental Sync flow.
  - message fetch fan-out.
- Gmail watch Module:
  - watch topic validation.
  - renewal response mapping.
- Gmail connect Module:
  - authorization URL creation.
  - exchange plus profile fetch.

### Effect v4 Notes

- Existing provider seams should remain `Context.Service` implementations.
- Internal Gmail helper Modules do not need `Context.Service` unless a second adapter or a
  meaningful test adapter appears.
- If moving async functions into Effect programs, use `Effect.fn("GmailApi.operation")` and
  `Effect.tryPromise(...)` at fetch boundaries.
- Keep `fetchImpl` injectable through `GmailSyncProviderConfig`.
- Do not expose new public package exports unless another package truly needs them.

### Steps

1. Add focused tests for history compaction:
   - message added.
   - label added.
   - label removed.
   - message deleted after previous changes.
   - duplicate history records.
   - deleted message fetch returning 404.
   - history page with no `history` array but a higher `historyId`.
2. Extract pure history compaction first.
3. Extract paginated Gmail history reading.
4. Extract paginated Gmail message listing for Initial Sync.
5. Extract message fetch fan-out.
6. Extract OAuth token refresh and authorization code exchange.
7. Extract response parsers.
8. Extract repeated missing-credential and `ProblemDetails` mapping used by sync and watch
   providers.
9. Keep the public layer factory functions as the package interface.
10. Re-run `npx fallow health`.

### Acceptance Criteria

- Public exports remain stable.
- Initial Sync behavior remains:
  - read profile `historyId`.
  - list baseline messages.
  - catch up from profile `historyId`.
  - commit snapshot with next Cursor.
- Incremental Sync behavior remains Cursor-based.
- Gmail `404` history response still becomes `gmail_history_cursor_invalid`.
- Gmail `403` and `429` rate limit responses still become `gmail_rate_limited`.
- `listHistoryDelta` complexity drops materially or disappears as a named large function.
- `packages/gmail/src/index.ts` is no longer the top `fallow health` refactoring target.

### Verification

```bash
pnpm --filter @mailmon/gmail test
pnpm --filter @mailmon/gmail typecheck
npx fallow health
```

---

## Slice 5: DB Persistence Adapter Partition

### Files

- `packages/db/src/persistence.ts`
- new internal DB files under `packages/db/src/persistence/`
- `packages/db/src/index.ts`
- all DB tests

### Problem

`packages/db/src/persistence.ts` combines many adapters behind many core service seams. The
seams are useful, but the implementation locality is poor because unrelated persistence
knowledge lives in one file.

The file should not be split by arbitrary helper type. It should be partitioned by service
adapter ownership.

### Target Shape

Keep the public exports stable from `packages/db/src/persistence.ts`, but move implementation
behind internal files.

Suggested partition:

- `persistence/database.ts`
  - `MailmonDatabase`
  - `createDatabaseLayer`
  - common DB handle type.
- `persistence/mappers.ts`
  - row-to-resource mapping.
  - timestamp conversion.
  - cursor serialization/deserialization.
- `persistence/problems.ts`
  - DB adapter problem mapping.
  - Postgres error shape helpers.
- `persistence/workspace-api-keys.ts`
- `persistence/mailbox-catalog.ts`
- `persistence/mailbox-query-catalog.ts`
- `persistence/mailbox-observability-catalog.ts`
- `persistence/connect-sessions.ts`
- `persistence/sync-runs.ts`
- `persistence/mailbox-sync-coordinator.ts`
- `persistence/mailbox-state-store.ts`
- `persistence/mailbox-watch-store.ts`
- `persistence/mailbox-repair-store.ts`
- `persistence/mailbox-execution-recovery-store.ts`
- `persistence/webhook-endpoints.ts`
- `persistence/webhook-deliveries.ts`
- `persistence/replays.ts`
- `persistence/gmail-credentials.ts`
- `persistence/layers.ts`

The re-export file should preserve:

- `createPersistenceServicesLayer`
- `createCorePersistenceLayer`
- `createWorkerPersistenceLayer`
- operator functions such as Gmail credential audit/rewrap helpers.

### Effect v4 Notes

- Keep each adapter as a `Layer.effect(Service, Effect.gen(...))`.
- Use the existing `MailmonDatabase` service as the shared DB adapter dependency.
- Do not create new service seams for row mappers. They are implementation details.
- Avoid circular imports by keeping common mapper/problem helpers dependency-light.

### Steps

1. Move `MailmonDatabase` and `createDatabaseLayer` first.
2. Move pure mappers and timestamp/cursor helpers.
3. Move one low-risk adapter file first, such as `WorkspaceApiKeyStore`.
4. Re-run `pnpm --filter @mailmon/db test`.
5. Move read-only adapters:
   - `MailboxCatalog`
   - `MailboxQueryCatalog`
   - `MailboxObservabilityCatalog`
6. Move write adapters:
   - Webhook Endpoint and Subscription stores.
   - Replay store.
   - Webhook Delivery store.
7. Move sync-critical adapters last:
   - `MailboxSyncCoordinator`
   - `SyncRunStore`
   - `MailboxStateStore`
   - repair/recovery/watch stores.
8. Keep `persistence.ts` as the compatibility barrel until all imports are updated.
9. Re-run full DB tests after each group.

### Acceptance Criteria

- Public imports from `@mailmon/db` keep working.
- `createCorePersistenceLayer` and `createWorkerPersistenceLayer` produce the same services.
- DB tests pass after each partition step.
- `packages/db/src/persistence.ts` becomes a barrel or small layer composition file.
- `fallow health` risk for `packages/db/src/persistence.ts` drops because unrelated adapter
  logic is no longer co-located.
- No database schema changes.

### Verification

```bash
pnpm --filter @mailmon/db test
pnpm --filter @mailmon/db typecheck
pnpm db:generate
npx fallow health
```

---

## Slice 6: Mailbox Operational State Policy

### Files

- `packages/core/src/contracts.ts`
- new `packages/core/src/mailbox-operational-state.ts`
- `packages/core/src/mailbox-sync-execution.ts`
- `packages/core/src/use-cases.ts`
- `packages/core/src/problems.ts`
- `packages/core/src/services.ts`
- `packages/core/src/use-cases.test.ts`
- DB persistence files after Slice 5 partition
- `packages/db/src/mailbox-repair.test.ts`
- `packages/db/src/gmail-credentials.test.ts`
- `packages/db/src/mailbox-sync-dispatch-exhaustion.test.ts`

### Problem

Product policy for Mailbox operational state is partly embedded in Postgres adapters. This
makes DB integration tests the main verification surface for product rules that should be
testable in core.

Policy currently includes:

- terminal Gmail credential failures.
- reconnect-required transitions.
- Gmail history Cursor invalid transitions.
- Gmail rate-limit transitions.
- dispatch retry exhaustion transitions.
- lease-lost Last Error text.
- Watch State renewal failure transitions.
- stuck execution recovery transitions.

### Target Shape

Create a core operational state policy Module that converts domain outcomes into explicit
transition values.

Suggested types:

```ts
export interface MailboxOperationalTransition {
  readonly lastError: null | {
    readonly code: string;
    readonly message: string;
    readonly occurredAt: string;
    readonly retryable: boolean;
  };
  readonly status?: MailboxStatus;
  readonly syncState?: MailboxSyncState;
  readonly watchState?: MailboxWatchState;
}
```

Suggested functions:

- `transitionForCompletedSyncRun(result: CompletedSyncRun): MailboxOperationalTransition | null`
- `transitionForDispatchRetryExhausted(params): MailboxOperationalTransition`
- `transitionForWatchRenewalFailure(params): MailboxOperationalTransition`
- `transitionForCredentialUnreadable(params): MailboxOperationalTransition`
- `isTerminalMailboxCredentialProblem(code: string): boolean`
- `isTerminalMailboxSyncProblem(code: string): boolean`

Persistence adapters apply transitions. They do not classify product meaning.

### Effect v4 Notes

- This policy can be pure. Do not make it a service unless callers need to swap policy.
- If failures become typed in the future, use `Schema.TaggedErrorClass` for matchable variants.
- Keep `ProblemDetails` as the current synchronous error envelope type unless a separate ADR
  changes the error model.

### Steps

1. Add core unit tests for transitions:
   - `gmail_token_refresh_reconnect_required`
   - `gmail_mailbox_credential_unreadable`
   - `gmail_mailbox_credentials_missing`
   - `gmail_history_cursor_invalid`
   - `gmail_rate_limited`
   - `mailbox_cursor_regressed`
   - `mailbox_sync_dispatch_retry_exhausted`
   - `lease_lost`
   - generic failed-after-lease-acquired problem
   - watch renewal failure before expiration
   - watch renewal failure after expiration
   - stuck execution recovery
2. Move terminal problem-code sets into the core policy Module.
3. Replace DB-side `getMailboxSyncFailureState` with applying a core transition.
4. Replace dispatch-exhaustion inline Last Error updates with a core transition.
5. Replace watch-renewal failure inline classification with a core transition.
6. Replace Gmail credential rewrap reconnect-required wording with a core transition.
7. Keep DB tests focused on transition application and transaction behavior.

### Acceptance Criteria

- Mailbox operational behavior is testable in core without Postgres.
- DB adapters no longer own product wording for Last Error except pure persistence details.
- Existing DB integration tests still pass.
- Public Mailbox resource shape remains unchanged.
- `@mailmon/core` remains transport-neutral.

### Verification

```bash
pnpm --filter @mailmon/core test
pnpm --filter @mailmon/db test
pnpm typecheck
```

---

## Slice 7: Canonical Mailbox State Commit Module

### Files

- DB persistence files after Slice 5 partition
- likely `packages/db/src/persistence/mailbox-state-store.ts`
- possible internal files:
  - `packages/db/src/persistence/mailbox-sync-commit/lease-guard.ts`
  - `packages/db/src/persistence/mailbox-sync-commit/cursor-guard.ts`
  - `packages/db/src/persistence/mailbox-sync-commit/message-apply.ts`
  - `packages/db/src/persistence/mailbox-sync-commit/thread-recalculation.ts`
  - `packages/db/src/persistence/mailbox-sync-commit/event-diff.ts`
  - `packages/db/src/persistence/mailbox-sync-commit/finalize.ts`
- `packages/core/src/contracts.ts`
- `packages/core/src/mailbox-sync-execution.ts`
- `packages/db/src/mailbox-event-emission.test.ts`
- `packages/db/src/read-model.test.ts`
- `packages/db/src/mailbox-repair.test.ts`

### Problem

`MailboxStateStore.applySyncResult` is a deep behavior Module with a small external seam, but
its implementation body is too hard to navigate.

The transaction currently combines:

- lease validation.
- Cursor regression detection.
- existing Message lookup.
- existing Thread lookup.
- Message upserts.
- Message deletes.
- Thread deletion for empty threads.
- Thread recalculation.
- Mailbox Event diffing.
- Mailbox Event insertion.
- Mailbox row finalization.
- Sync Run finalization.
- lease clearing.

The external interface is correct. The implementation needs internal locality.

### Target Shape

Keep one external seam:

- `MailboxStateStore.applySyncResult(...)`

Split the implementation into internal Modules:

- lease guard.
- Cursor guard.
- Canonical Message apply.
- Canonical Thread recalculation.
- Mailbox Event diff builder.
- transaction finalizer.

The entire commit must remain one database transaction.

### Effect v4 Notes

- The external service remains `Context.Service`.
- Internal transaction helpers can be async functions if they live entirely inside the Drizzle
  transaction callback.
- If helpers return Effects, do not cross the transaction boundary in a way that makes ordering
  unclear.
- Use `Effect.fn` for named commit workflow functions if the transaction is moved out of an
  inline method.

### Steps

1. Add regression tests around current guarantees:
   - no Cursor advancement if lease is lost.
   - no Cursor advancement on Cursor regression.
   - Message created emits `message.created`.
   - Message changed emits `message.updated`.
   - Thread recalculation emits `thread.updated`.
   - duplicate sync does not duplicate Mailbox Events.
   - delete-only sync recalculates surviving Thread state.
   - sync finalization clears lease and completes Sync Run atomically.
   - rollback prevents Mailbox Event rows when finalization fails.
2. Extract pure event-diff helpers first.
3. Extract Cursor regression logic into a focused helper.
4. Extract affected-thread calculation.
5. Extract Message row lookup and upsert helpers.
6. Extract Thread recalculation helper.
7. Extract finalization update helper.
8. Keep a single top-level transaction in `applySyncResult`.
9. Re-run DB integration tests after each step.

### Acceptance Criteria

- `MailboxStateStore.applySyncResult` remains the external seam.
- Transactional behavior remains unchanged.
- Event count returned to `runMailboxSync` comes from committed Mailbox Event rows, not provider
  estimates.
- Cursor safety is unchanged.
- `packages/db/src/persistence/mailbox-state-store.ts` or equivalent is navigable through named
  internal Modules.
- `fallow health` shows lower risk in the old persistence hotspot or distributes risk into
  smaller named Modules.

### Verification

```bash
pnpm --filter @mailmon/db test
pnpm --filter @mailmon/core test
pnpm typecheck
npx fallow health
```

---

## Slice 8: Public Route Contract Module

### Files

- `packages/core/src/contracts.ts`
- possible new `packages/core/src/public-http-contracts.ts`
- `packages/core/src/index.ts`
- `apps/api/src/server.ts`
- `apps/api/src/http/parsers.ts`
- `apps/api/src/http/validation.ts`
- `apps/api/src/generate-openapi.ts`
- `apps/api/src/public-contract.test.ts`
- `apps/docs/api-reference/openapi.json`
- `plans/archive/migration/2026-04-29-hono-openapi-effect-schema-migration.md`

### Problem

Public request and response contracts remain split. This weakens leverage because a public
contract change requires coordinated edits across core, Hono parsing, manual JSON schemas,
OpenAPI post-processing, and the generated docs artifact.

### Target Shape

Finish the schema-first public contract migration.

Core should own public resource and request schemas where they represent Mailmon's public
contract:

- Mailbox.
- Message.
- Thread.
- Replay.
- Webhook Endpoint.
- Subscription.
- Sync Run.
- Observability.
- Problem Envelope.
- Connect Session.

The Hono adapter should own transport shaping:

- path param extraction.
- query alias normalization where both `mailboxId` and `mailbox_id` are accepted.
- request origin derivation.
- auth header extraction.
- mapping validation failures into Problem Envelope responses.

OpenAPI generation should become mostly schema attachment plus minimal normalization.

### Effect v4 Notes

- Use v4 `Schema` as the source of public contract truth.
- Prefer schema-derived types for public request/resource shapes once the schema exists.
- Keep camelCase as the public v1 JSON shape.
- Do not remove snake_case compatibility in request parsing unless product policy changes.
- If `Schema.toStandardJSONSchemaV1(Schema.toStandardSchemaV1(...))` remains necessary for
  Hono integration, keep that adapter code in `apps/api`.

### Steps

1. Inventory every public route request and response schema.
2. Add core public Schemas without removing existing interfaces yet.
3. Convert one low-risk resource first, such as `ProblemDetails` or `ConnectSessionResource`.
4. Replace the corresponding manual response schema in `apps/api/src/server.ts`.
5. Add a round-trip test that the generated OpenAPI schema matches the committed artifact for
   that route.
6. Convert the remaining resources in groups:
   - mailbox and observability.
   - messages and threads.
   - webhook endpoints and subscriptions.
   - replay.
   - sync runs.
7. Reduce `apps/api/src/generate-openapi.ts` post-processing as shared Schemas remove the need.
8. Regenerate `apps/docs/api-reference/openapi.json`.
9. Strengthen `apps/api/src/public-contract.test.ts` so it compares generated OpenAPI to the
   committed docs artifact, not only selected fields.

### Acceptance Criteria

- Public HTTP adapter stays thin.
- Core owns public resource schemas.
- Validation failures still return deterministic Problem Envelope details.
- Generated OpenAPI remains compatible with docs.
- `apps/api/src/server.ts` loses manual schema bulk.
- `apps/api/src/generate-openapi.ts` complexity drops.
- Public request/response JSON shape does not change.

### Verification

```bash
pnpm --filter @mailmon/api test
pnpm --filter @mailmon/api build
pnpm openapi:generate
pnpm typecheck
pnpm format:check
```

---

## Cross-Slice Verification

Run this before considering the refactor set complete:

```bash
pnpm build
pnpm lint
pnpm typecheck
pnpm test
pnpm format:check
pnpm db:generate
npx fallow dead-code
npx fallow dupes
npx fallow health
```

Expected direction:

- Dead code remains zero.
- Lint and typecheck warnings drop to zero.
- `pnpm format:check` passes.
- Duplication drops below the current 7.1 percent.
- `packages/gmail/src/index.ts` no longer appears as the top concrete refactor target.
- `packages/db/src/persistence.ts` becomes a small compatibility barrel or layer composition
  Module.
- Mailbox operational state decisions are tested in core.
- Tests become more behavior-focused and less setup-heavy.

## Stop Conditions

Pause and reassess if any slice requires:

- changing Mailbox as the unit of work.
- adding transport details to `@mailmon/core`.
- changing public route/resource shapes without a core contract update.
- moving Gmail HTTP behavior outside `@mailmon/gmail`.
- splitting a real adapter seam into a hypothetical seam with only one adapter and no testing
  leverage.
- moving transaction steps out of the Canonical Mailbox State commit transaction.
- weakening Cursor safety.
- scheduling Webhook Delivery from inline sync network calls.
- weakening Webhook Delivery durability guarantees.
- reintroducing old Effect v3 APIs.
- hiding service dependencies inside helper callbacks when `yield* Service` would keep them
  explicit.

## Open Questions

1. Should the Webhook Delivery request-building Module live in `@mailmon/core`, or should a
   small shared runtime package exist later if more HTTP request builders appear?
2. Should Mailbox operational transition values be exported as public core contracts, or stay
   internal to core use-case and adapter implementation?
3. Should the DB partition keep `packages/db/src/persistence.ts` as a permanent compatibility
   barrel, or should consumers eventually import from narrower package exports?
4. Should Gmail internals move to Effect-returning helpers now, or should that wait until
   tracing/observability work makes `Effect.fn` spans valuable enough to justify the churn?
5. Should `apps/api/src/public-contract.test.ts` generate OpenAPI during the test, or should
   generation remain a separate command with the test only reading the committed artifact?
6. Should the migration plan be amended to visually separate historical breakage inventory from
   active residual cleanup?
