# Effect v4 Migration Status

Date: 2026-05-11

## Goal

Get the repo building cleanly on `effect@4.0.0-beta.65` by migrating the remaining v3 APIs in a controlled order, starting with the packages that define shared service, config, and schema surfaces.

Status on 2026-05-11: complete for repo build/test health. This document now records the verified end state, the migration families that were involved, and the small residual cleanup that remains outside the critical migration path.

## Inputs Used

- `pnpm build`
- `pnpm typecheck`
- `pnpm test`
- isolated builds for `@mailmon/core`, `@mailmon/config`, `@mailmon/gmail`, `@mailmon/db`, `@mailmon/queue`, `@mailmon/api`, `@mailmon/worker`
- `pnpm exec effect-solutions list`
- `pnpm exec effect-solutions show basics services-and-layers config testing tsconfig`
- upstream v4 references:
  - [.repos/effect/MIGRATION.md](/home/satty/projects/mailmon-dev/.repos/effect/MIGRATION.md)
  - [.repos/effect/migration/services.md](/home/satty/projects/mailmon-dev/.repos/effect/migration/services.md)
  - [.repos/effect/migration/runtime.md](/home/satty/projects/mailmon-dev/.repos/effect/migration/runtime.md)
  - [.repos/effect/migration/schema.md](/home/satty/projects/mailmon-dev/.repos/effect/migration/schema.md)
  - [.repos/effect/ai-docs/src/03_integration/10_managed-runtime.ts](/home/satty/projects/mailmon-dev/.repos/effect/ai-docs/src/03_integration/10_managed-runtime.ts)

## Current Status

The migration plan described below is no longer an active blocker list. The repo currently verifies as:

- `pnpm build`: passes
- `pnpm typecheck`: passes with warnings only
- `pnpm test`: passes

The migration families below were the main sources of churn during the v4 move:

1. `Context.Tag` and related v3 service patterns across core and adapters
2. v3 config APIs in `packages/config`
3. schema constructors/helpers that changed shape in v4
4. renamed or removed v3 effect combinators and runtime helpers
5. type inference fallout after the mechanical API updates

Residual non-blocking cleanup still visible in the workspace:

- [apps/api/src/server.ts](/home/satty/projects/mailmon-dev/apps/api/src/server.ts:525)
  - `typescript(no-unnecessary-type-parameters)`
  - `typescript(no-unsafe-type-assertion)`
- [apps/worker/src/processor.test.ts](/home/satty/projects/mailmon-dev/apps/worker/src/processor.test.ts:131)
  - `typescript(no-unsafe-type-assertion)` at two runtime test doubles

## Breakage Inventory

### 1. Service definition and service access migration

These files still rely on `Context.Tag(...)<...>()` and will not typecheck until moved to `Context.Service<...>()("...")`:

- [packages/core/src/services.ts](/home/satty/projects/mailmon-dev/packages/core/src/services.ts)
  - `MailboxCatalog`
  - `WorkspaceApiKeyStore`
  - `WebhookEndpointCatalog`
  - `WebhookEndpointStore`
  - `WebhookEndpointSubscriptionStore`
  - `MailboxQueryCatalog`
  - `MailboxObservabilityCatalog`
  - `MailboxConnectSessionStore`
  - `SyncRunStore`
  - `MailboxSyncCoordinator`
  - `MailboxSyncProvider`
  - `MailboxConnectProvider`
  - `MailboxStateStore`
  - `MailboxSyncDispatchExhaustionStore`
  - `MailboxWatchStore`
  - `MailboxRepairStore`
  - `MailboxExecutionRecoveryStore`
  - `MailboxWatchProvider`
  - `MailboxPushNotificationStore`
  - `MailboxSyncDispatcher`
  - `WebhookDeliveryScheduler`
  - `WebhookDeliveryStore`
  - `ReplayStore`
  - `WebhookDeliverySender`
  - `ControlJobDispatcher`
- [packages/config/src/index.ts](/home/satty/projects/mailmon-dev/packages/config/src/index.ts)
  - `CommonConfig`
  - `ApiConfig`
  - `WorkerConfig`
  - `CliConfig`
- [packages/gmail/src/index.ts](/home/satty/projects/mailmon-dev/packages/gmail/src/index.ts)
  - `GmailRefreshTokenCipher`
  - `GmailMailboxCredentialStore`
- [packages/db/src/persistence.ts](/home/satty/projects/mailmon-dev/packages/db/src/persistence.ts)
  - `MailmonDatabase`
- [packages/queue/src/index.ts](/home/satty/projects/mailmon-dev/packages/queue/src/index.ts)
  - `LocalAsyncTransportProbe`
- [apps/worker/src/server.ts](/home/satty/projects/mailmon-dev/apps/worker/src/server.ts)
  - `WorkerHttpProcessors`

Secondary fallout from those old tags is everywhere that currently does `yield* SomeService`, `Layer.succeed(SomeService, ...)`, or `Layer.effect(SomeService, ...)`. Most of the `TS2488`, `Key<unknown, unknown>`, and `unknown` inference explosions are downstream of this.

### 2. Config API migration

`packages/config` is still written in the v3 style and blocks the full workspace immediately.

Primary files:

- [packages/config/src/index.ts](/home/satty/projects/mailmon-dev/packages/config/src/index.ts)
- [packages/config/src/index.test.ts](/home/satty/projects/mailmon-dev/packages/config/src/index.test.ts)

Concrete breakages:

- `Config.validate` no longer exists
- `Config.literal(...)("NAME")` call style no longer exists
- `Effect.all({ ...Config... })` is invalid because `Config` values are not `Effect`s
- `Context.Tag` classes for config services are invalid in v4
- `SomeConfig.pipe(Effect.provide(SomeConfig.layer))` no longer works on the service class itself
- `Effect.withConfigProvider` no longer exists
- `ConfigProvider.fromJson` no longer exists; v4 uses `ConfigProvider.fromUnknown(...)`

Expected target shape:

- build config values with v4 `Config` combinators
- parse config via `config.parse(...)` or by installing a provider layer
- expose service layers with `Context.Service`
- update tests to use `ConfigProvider.fromUnknown(...)` and `ConfigProvider.layer(...)` or `Effect.provideService(ConfigProvider.ConfigProvider, ...)`

### 3. Schema constructor and helper migration

These files still use removed or signature-changed schema APIs:

- [packages/core/src/contracts.ts](/home/satty/projects/mailmon-dev/packages/core/src/contracts.ts)
  - variadic `Schema.Literal(...)`
  - downstream type pollution from old literal constructors
- [apps/api/src/http/parsers.ts](/home/satty/projects/mailmon-dev/apps/api/src/http/parsers.ts)
  - `Schema.int()`
  - `Schema.between(...)`
  - `Schema.filter(...)`
  - variadic `Schema.Literal(...)`
  - variadic `Schema.Union(...)`
- [apps/api/src/http/validation.ts](/home/satty/projects/mailmon-dev/apps/api/src/http/validation.ts)
  - `Schema.standardSchemaV1(...)`
- [packages/core/src/internal-message-codec.ts](/home/satty/projects/mailmon-dev/packages/core/src/internal-message-codec.ts)
  - `Schema.parseJson()`
  - variadic `Schema.Union(...)`
- [apps/worker/src/runtime.ts](/home/satty/projects/mailmon-dev/apps/worker/src/runtime.ts)
  - `Schema.parseJson()`

Upstream mapping to apply:

- `Schema.Literal("a", "b")` -> `Schema.Literals(["a", "b"])`
- `Schema.Union(A, B)` -> `Schema.Union([A, B])`
- `Schema.standardSchemaV1` -> `Schema.toStandardSchemaV1`
- `Schema.filter` -> `Schema.check(...)` or `Schema.refine(...)`
- `Schema.int()` -> `Schema.Int` or `Schema.check(Schema.isInt())` depending the existing value shape
- `Schema.between(1, n)` -> `Schema.check(Schema.isBetween(1, n))`
- `Schema.parseJson()` -> `Schema.UnknownFromJsonString` or `Schema.fromJsonString(...)`

The contract file is especially important because its schema changes affect derived type aliases used across core, db, api, and worker code.

### 4. Effect combinator and runtime migration

These files still use renamed or removed v3 combinators:

- [packages/core/src/mailbox-event-delivery-scheduling.ts](/home/satty/projects/mailmon-dev/packages/core/src/mailbox-event-delivery-scheduling.ts)
  - `Cause.isInterruptedOnly`
  - `Effect.catchAllCause`
- [packages/core/src/mailbox-sync-execution.ts](/home/satty/projects/mailmon-dev/packages/core/src/mailbox-sync-execution.ts)
  - `Effect.zipRight`
  - `Effect.catchAll`
- [packages/core/src/use-cases.ts](/home/satty/projects/mailmon-dev/packages/core/src/use-cases.ts)
  - `Effect.zipRight`
  - `Effect.catchAll`
- [packages/queue/src/index.ts](/home/satty/projects/mailmon-dev/packages/queue/src/index.ts)
  - `Layer.unwrapEffect`
  - `Effect.runtime`
  - `Runtime.runPromise`
  - `Effect.zipRight`
- [packages/db/src/persistence.ts](/home/satty/projects/mailmon-dev/packages/db/src/persistence.ts)
  - `Effect.either`
- [apps/worker/src/runtime.ts](/home/satty/projects/mailmon-dev/apps/worker/src/runtime.ts)
  - `Layer.scoped`

Upstream mapping to apply:

- `Cause.isInterruptedOnly` -> `Cause.hasInterruptsOnly`
- `catchAllCause` -> `catchCause`
- `catchAll` -> `catch`
- `Effect.runtime` / `Runtime.runPromise` -> `Effect.context` plus `Effect.run*With(...)` when manual runtime bridging is still needed
- replace `zipRight` callsites with direct generator sequencing or the current v4 sequencing helper that best matches each callsite
- replace `either` with the v4 equivalent only where needed; many callsites are cleaner as generator branches instead of preserving `Either`

### 5. Option API migration

These files still use removed v3 option helpers:

- [packages/db/src/bootstrap.ts](/home/satty/projects/mailmon-dev/packages/db/src/bootstrap.ts)
  - `Option.fromNullable`
- [packages/db/src/persistence.ts](/home/satty/projects/mailmon-dev/packages/db/src/persistence.ts)
  - `Option.fromNullable`

Likely target is `Option.fromNullishOr(...)` or a direct `Option.match(...)` based rewrite depending the local data flow.

### 6. Type inference fallout after the mechanical migration

The following categories are not the first thing to fix, but they will remain after the API moves:

- schema-derived literal unions are currently inferred as tuple-like types because old v3 constructors are being misapplied
  - [packages/core/src/contracts.ts](/home/satty/projects/mailmon-dev/packages/core/src/contracts.ts)
  - [packages/db/src/persistence.ts](/home/satty/projects/mailmon-dev/packages/db/src/persistence.ts)
  - [packages/db/src/bootstrap.ts](/home/satty/projects/mailmon-dev/packages/db/src/bootstrap.ts)
- service values become `unknown` after `yield*` until the service classes move to `Context.Service`
  - core use cases
  - gmail adapter
  - db persistence
  - worker server
- exact layer context and error expectations need tightening
  - [apps/worker/src/index.ts](/home/satty/projects/mailmon-dev/apps/worker/src/index.ts)
  - [apps/worker/src/runtime.ts](/home/satty/projects/mailmon-dev/apps/worker/src/runtime.ts)

## Migration Order

This was the right order for the migration work. It is retained here as the record of execution order and for future Effect upgrades.

### Phase 1: Establish the shared service model

Scope:

- [packages/core/src/services.ts](/home/satty/projects/mailmon-dev/packages/core/src/services.ts)
- [packages/config/src/index.ts](/home/satty/projects/mailmon-dev/packages/config/src/index.ts)
- [packages/gmail/src/index.ts](/home/satty/projects/mailmon-dev/packages/gmail/src/index.ts)
- [packages/db/src/persistence.ts](/home/satty/projects/mailmon-dev/packages/db/src/persistence.ts)
- [packages/queue/src/index.ts](/home/satty/projects/mailmon-dev/packages/queue/src/index.ts)
- [apps/worker/src/server.ts](/home/satty/projects/mailmon-dev/apps/worker/src/server.ts)

Work:

- replace every `Context.Tag` class with `Context.Service`
- keep existing string identifiers
- keep service shapes transport-neutral
- where a service needs a built-in constructor, use `static readonly layer = Layer.effect(ServiceClass, ...)`
- use `ServiceClass.of({...})` when returning implementations from `Layer.effect`

Exit criteria:

- no remaining `Context.Tag`, `Effect.Tag`, `Effect.Service`, or `Context.GenericTag` in `apps/` or `packages/`

### Phase 2: Rewrite `packages/config` fully

Scope:

- [packages/config/src/index.ts](/home/satty/projects/mailmon-dev/packages/config/src/index.ts)
- [packages/config/src/index.test.ts](/home/satty/projects/mailmon-dev/packages/config/src/index.test.ts)

Work:

- rebuild the env readers using v4 `Config`
- decide whether `nonEmptyString` should use `Config.mapOrFail` or a schema-backed parse step
- replace the old `Config.literal(...)("NAME")` pattern with the v4 literal parser pattern
- stop mixing `Config` and `Effect` in the same `Effect.all` object
- expose `CommonConfig`, `ApiConfig`, `WorkerConfig`, and `CliConfig` as `Context.Service`
- replace `Effect.withConfigProvider(...)` with explicit provider installation in the effect under test
- replace `ConfigProvider.fromJson(...)` with `ConfigProvider.fromUnknown(...)`

Verification:

- `pnpm --filter @mailmon/config build`
- `pnpm --filter @mailmon/config test`

### Phase 3: Migrate shared schema contracts

Scope:

- [packages/core/src/contracts.ts](/home/satty/projects/mailmon-dev/packages/core/src/contracts.ts)
- [packages/core/src/internal-message-codec.ts](/home/satty/projects/mailmon-dev/packages/core/src/internal-message-codec.ts)
- [apps/api/src/http/parsers.ts](/home/satty/projects/mailmon-dev/apps/api/src/http/parsers.ts)
- [apps/api/src/http/validation.ts](/home/satty/projects/mailmon-dev/apps/api/src/http/validation.ts)
- [apps/worker/src/runtime.ts](/home/satty/projects/mailmon-dev/apps/worker/src/runtime.ts)

Work:

- replace variadic literals and unions
- replace removed validation/filter helpers
- replace old JSON string schemas
- re-check all exported schema-derived type aliases after the rewrite

This phase should remove the tuple-shaped inferred types that are currently infecting:

- `MailboxStatus`
- `MailboxSyncState`
- `MailboxWatchState`
- `WebhookEventType`
- `ReplayStatus`
- `SyncRunOutcome`
- `MailboxSyncRunInspectionStatus`
- `ControlJobKind`

Verification:

- `pnpm --filter @mailmon/core build`
- `pnpm --filter @mailmon/api build`
- `pnpm --filter @mailmon/worker build`

### Phase 4: Migrate core workflows to v4 effect combinators

Scope:

- [packages/core/src/mailbox-event-delivery-scheduling.ts](/home/satty/projects/mailmon-dev/packages/core/src/mailbox-event-delivery-scheduling.ts)
- [packages/core/src/mailbox-sync-execution.ts](/home/satty/projects/mailmon-dev/packages/core/src/mailbox-sync-execution.ts)
- [packages/core/src/use-cases.ts](/home/satty/projects/mailmon-dev/packages/core/src/use-cases.ts)

Work:

- replace old `catch*` combinators with v4 names
- replace `zipRight` with explicit generator sequencing where readability improves
- re-check control-job branching after union types are corrected
- tighten return types where v4 now exposes missing error/context precision

Verification:

- `pnpm --filter @mailmon/core build`
- `pnpm --filter @mailmon/core test`

### Phase 5: Migrate infrastructure adapters

Scope:

- [packages/queue/src/index.ts](/home/satty/projects/mailmon-dev/packages/queue/src/index.ts)
- [packages/gmail/src/index.ts](/home/satty/projects/mailmon-dev/packages/gmail/src/index.ts)
- [packages/db/src/bootstrap.ts](/home/satty/projects/mailmon-dev/packages/db/src/bootstrap.ts)
- [packages/db/src/persistence.ts](/home/satty/projects/mailmon-dev/packages/db/src/persistence.ts)

Work:

- queue:
  - remove `Layer.unwrapEffect`
  - replace manual runtime extraction with the v4 context/run helpers
  - keep transport-neutral service boundaries intact
- gmail:
  - move service tags to `Context.Service`
  - restore proper service access and layer provisioning
- db:
  - replace `Option.fromNullable`
  - fix schema-derived string unions after Phase 3
  - remove v3 combinators
  - re-tighten typed transaction/result mapping now that services are no longer `unknown`

Verification:

- `pnpm --filter @mailmon/queue build`
- `pnpm --filter @mailmon/gmail build`
- `pnpm --filter @mailmon/db build`
- `pnpm --filter @mailmon/db test`

### Phase 6: Migrate app adapters and runtime bridges

Scope:

- [apps/api/src/runtime.ts](/home/satty/projects/mailmon-dev/apps/api/src/runtime.ts)
- [apps/api/src/server.ts](/home/satty/projects/mailmon-dev/apps/api/src/server.ts)
- [apps/api/src/http/handlers.ts](/home/satty/projects/mailmon-dev/apps/api/src/http/handlers.ts)
- [apps/worker/src/runtime.ts](/home/satty/projects/mailmon-dev/apps/worker/src/runtime.ts)
- [apps/worker/src/server.ts](/home/satty/projects/mailmon-dev/apps/worker/src/server.ts)
- [apps/worker/src/index.ts](/home/satty/projects/mailmon-dev/apps/worker/src/index.ts)
- [apps/cli/src/app.ts](/home/satty/projects/mailmon-dev/apps/cli/src/app.ts)
- [apps/cli/src/index.ts](/home/satty/projects/mailmon-dev/apps/cli/src/index.ts)

Work:

- keep `ManagedRuntime` as the bridge for Hono and CLI entrypoints where it already fits
- update type aliases that still assume the old service class shape
- remove stale `Effect.Effect` namespace type references such as `Effect.Effect<...>` when imported incorrectly
- fix `Layer.scoped` callsites against the v4 layer API
- fix request/body inference in API handlers after schema types are corrected

Verification:

- `pnpm --filter @mailmon/api build`
- `pnpm --filter @mailmon/worker build`
- `pnpm --filter @mailmon.dev/cli build`

### Phase 7: Test migration and cleanup

Scope:

- all `*.test.ts` files touched by the above packages

Work:

- convert config provider setup to v4
- update tests that rely on service yieldability or service class `.pipe(...)`
- keep test layers local and explicit, following `effect-solutions` testing guidance
- clear package `.tsbuildinfo` files if stale workspace types mask the real errors

Verification:

- `pnpm test`

## Recommended Execution Strategy

Use a narrow red-green loop instead of attempting the whole repo at once:

1. `@mailmon/config`
2. `@mailmon/core`
3. `@mailmon/queue`
4. `@mailmon/gmail`
5. `@mailmon/db`
6. `@mailmon/api`
7. `@mailmon/worker`
8. `@mailmon.dev/cli`
9. workspace `build`, `typecheck`, `test`

Reason: `config` and `core` define the type surfaces that everything else imports. Until those two are clean, the rest of the diagnostics are noisy and partially misleading.

## Risk Areas

- `packages/core/src/contracts.ts` is not a mechanical search/replace only; the schema constructor changes alter inferred public types.
- `packages/db/src/persistence.ts` will have the highest manual cleanup cost because it combines service access, schema-derived unions, options, and generic SQL helpers.
- `packages/queue/src/index.ts` has manual runtime-bridging work because v4 removed the old runtime value shape.
- `apps/api/src/server.ts` and `apps/worker/src/server.ts` should be left until upstream schema and service types are stable, otherwise request typing will churn.

## Done Definition

The migration is complete when all of the following hold:

- `rg -n "Context\\.Tag|Effect\\.Tag|Effect\\.Service|Context\\.GenericTag|withConfigProvider|ConfigProvider\\.fromJson|Config\\.validate|Schema\\.standardSchemaV1|Schema\\.parseJson|Effect\\.runtime|Runtime\\.runPromise|Effect\\.zipRight|Effect\\.catchAll\\b|Effect\\.catchAllCause\\b|Option\\.fromNullable|Layer\\.unwrapEffect|Layer\\.scoped|Cause\\.isInterruptedOnly|Schema\\.Literal\\(|Schema\\.filter\\(|Schema\\.int\\(|Schema\\.between\\(" packages apps` returns no stale v3 migration matches
- `pnpm build` passes
- `pnpm typecheck` passes
- `pnpm test` passes

Verified on 2026-05-11:

- `pnpm build`: passes
- `pnpm typecheck`: passes with warnings only
- `pnpm test`: passes

Notes:

- `Schema.Union([ ... ])` is still expected in repo code and should not be part of the stale-pattern grep.
- `Effect.promise(...)` in CLI code is not a migration blocker; the repo match is a current API choice, not evidence of v3 runtime bridging.

## Non-Goals During Migration

- do not redesign the mailbox/workspace/domain model
- do not change transport boundaries between core and adapters
- do not mix unrelated refactors into the migration
- do not introduce new Effect abstractions unless the v4 migration forces them
