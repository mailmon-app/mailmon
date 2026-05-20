# Mailmon Architecture Follow-up Refactor Log

## 2026-05-14 - Slice 0: Fallow Baseline Cleanup

Completed the baseline cleanup from `plans/mailmon-architecture-follow-up-refactor-plan.md`.

Changes:

- Made unused DB mapper helpers private in `packages/db/src/persistence/mappers.ts`.
- Removed the unused public `DatabaseHandle` re-export from `packages/db/src/persistence.ts`.
- Made unused API test-harness fixture factories and foreign fixtures private.
- Made `toEffectJsonSchema`, `JsonRequestReader`, `createWorkerInternalErrorResponse`, and Gmail `isReadonlyRecord` private.
- Added package-local `@effect/vitest` dev dependency metadata for workspaces that import it directly: CLI, config, core, and DB.
- Added narrow Fallow suppressions for the intentional root `pnpm.overrides` pins for transitive `esbuild` and `uuid`.

Verification:

- `pnpm exec effect-solutions list` passed before Effect-related edits.
- `pnpm exec effect-solutions show testing` consulted for `@effect/vitest` package metadata.
- `npx fallow dead-code` passes with no issues.
- `pnpm lint` passes: 13 tasks successful.
- `pnpm typecheck` passes: 13 tasks successful.
- `pnpm test` passes: 17 tasks successful, 223 tests passing.
- `pnpm format:check` passes: 8 tasks successful.
- `npx fallow health` still fails the configured threshold, but improved from `77 B` to `78 B`; dead exports are now `0.0%`.
- `npx fallow dupes` is unchanged at 971 duplicated lines, 3.2 percent, 22 clone groups.

Notes:

- The remaining health failures are the known large-function and complexity targets reserved for later slices.
- No product behavior changes were intended.

## 2026-05-14 - Slice 1: DB Persistence Mapper Partition

Completed the DB persistence mapper partition from `plans/mailmon-architecture-follow-up-refactor-plan.md`.

Changes:

- Deleted the broad `packages/db/src/persistence/mappers.ts` implementation module.
- Added focused mapper modules under `packages/db/src/persistence/`:
  - `common-mappers.ts` for shared timestamp, hashing, mailbox ID, and API-key identity helpers.
  - `pagination-cursors.ts` for message, thread, and sync-run cursor encoding/decoding.
  - `public-resource-mappers.ts` for Mailbox, Message, Thread, Replay, Webhook Endpoint, Subscription, Connect Session, Sync Run inspection, and observability resource mapping.
  - `canonical-state-mappers.ts` for Canonical Message/Thread insert/update sets, cursor regression detection, comparison helpers, and label normalization.
  - `mailbox-event-mappers.ts` for stable Mailbox Event identity construction and insert mapping.
  - `webhook-delivery-mappers.ts` for stable Webhook Delivery IDs, prepared delivery mapping, and recovery scheduling.
  - `operational-state-mappers.ts` for Sync Run creation and Mailbox operational transition update mapping.
- Updated DB persistence adapters to import only the focused mapper modules relevant to their work.

Verification:

- `pnpm exec effect-solutions list` passed before starting the slice; no new Effect pattern was introduced.
- `pnpm --filter @mailmon/db test` passes: 9 test files, 44 tests.
- `pnpm --filter @mailmon/db typecheck` passes with zero warnings and zero errors.
- `npx fallow dead-code` passes with no issues.
- `npx fallow health` still fails the configured threshold at `78 B`; dead exports remain `0.0%`, and the remaining complexity findings are the planned later slices.
- `pnpm db:generate` passes; Drizzle reports 14 tables and no schema changes.
- `pnpm format:check` passes after formatting the DB package.

Notes:

- No package-level exports were added.
- No product behavior changes were intended.

## 2026-05-14 - Slice 2: Gmail Package Internal Ownership

Completed the Gmail package internal ownership split from
`plans/mailmon-architecture-follow-up-refactor-plan.md`.

Changes:

- Reduced `packages/gmail/src/index.ts` to a shallow public entry point that re-exports the
  existing service tags, public types, and layer factory functions.
- Added `packages/gmail/src/services.ts` for the public Gmail service tags and public
  configuration/types.
- Added `packages/gmail/src/refresh-token-cipher.ts` for AES-GCM refresh-token envelope parsing,
  key-ring creation, encryption, decryption, inspection, and rewrap behavior.
- Added `packages/gmail/src/canonical-projection.ts` for Gmail message projection, Canonical
  Mailbox State snapshot construction, and Initial Sync merge rules.
- Added `packages/gmail/src/sync-workflows.ts`, `connect-workflows.ts`, and `watch-workflows.ts`
  for HTTP Gmail provider workflow assembly.
- Added `packages/gmail/src/stub-sync-provider.ts` for deterministic local sync behavior.
- Updated `packages/gmail/src/http-api.ts` to depend on the Gmail config type from the focused
  services module instead of the package entry point.
- Added direct refresh-token cipher coverage for active-key rewrap no-op behavior, unknown key
  IDs, and invalid encrypted envelopes.

Verification:

- `pnpm exec effect-solutions list` passed before starting the slice.
- `pnpm exec effect-solutions show services-and-layers data-modeling error-handling basics`
  consulted before changing Effect service/layer code.
- `pnpm --filter @mailmon/gmail test` passes: 1 test file, 23 tests.
- `pnpm --filter @mailmon/gmail typecheck` passes with zero warnings and zero errors.
- `pnpm --filter @mailmon/gmail build` passes.
- `pnpm --filter @mailmon/gmail format:check` passes.
- `npx fallow dead-code` passes with no issues.
- `npx fallow health` still fails the configured threshold at `78 B`, but dead exports remain
  `0.0%`, high-complexity findings decreased from 17 to 16, and `packages/gmail/src/index.ts` is
  no longer reported as a meaningful hotspot or high-complexity file.

Notes:

- Public imports from `@mailmon/gmail` remain stable.
- No new `Context.Service` seam was introduced.
- No product behavior changes were intended.

## 2026-05-14 - Slice 3: Webhook Delivery Execution Module

Completed the Webhook Delivery execution module extraction from
`plans/mailmon-architecture-follow-up-refactor-plan.md`.

Changes:

- Added `packages/core/src/webhook-delivery-execution.ts` to own Webhook Delivery retry policy,
  endpoint response classification, transport failure classification, completion construction,
  compare-and-swap finalization, and retry rescheduling.
- Kept `runWebhookDelivery(...)` available from `packages/core/src/use-cases.ts` as a forwarding
  export, preserving existing imports from `@mailmon/core`.
- Added direct classifier coverage in `packages/core/src/webhook-delivery-execution.test.ts` for
  successful responses, retryable 5xx responses, max-attempt exhaustion, non-retryable 4xx
  responses, retryable transport failures, and capped exponential retry delay behavior.
- Left the existing `WebhookDeliveryStore`, `WebhookDeliverySender`, and
  `WebhookDeliveryScheduler` service seams unchanged.

Verification:

- `pnpm exec effect-solutions list` passed before starting the slice.
- `pnpm exec effect-solutions show basics services-and-layers error-handling testing` consulted
  before changing Effect workflow and test code.
- `pnpm --filter @mailmon/core test` passes: 5 test files, 85 tests.
- `pnpm --filter @mailmon/core typecheck` passes with zero warnings and zero errors.
- `pnpm --filter @mailmon/worker test -- src/runtime.test.ts` passes: 4 test files, 33 tests.
- `pnpm --filter @mailmon.dev/cli test -- src/app.test.ts` passes: 1 test file, 10 tests.
- `pnpm typecheck` passes: 13 tasks successful.
- `npx fallow dead-code` passes with no issues.
- `pnpm format:check` passes: 8 tasks successful.
- `npx fallow health` still fails the configured threshold at `78 B`, but high-complexity
  findings decreased from 16 to 15 and the Webhook Delivery execution policy no longer appears as
  a complexity finding in `packages/core/src/use-cases.ts`.

Notes:

- `packages/core/src/use-cases.ts` dropped roughly 250 lines and now delegates delivery execution
  to the named Module.
- No product behavior changes were intended.

## 2026-05-14 - Slice 4: Core Workflow Partition

Completed the core workflow partition from
`plans/mailmon-architecture-follow-up-refactor-plan.md`.

Changes:

- Reduced `packages/core/src/use-cases.ts` to a compatibility export module for the stable public
  use-case surface.
- Added focused core workflow modules:
  - `packages/core/src/replay-dispatch.ts` for Replay dispatch target scanning, delivery creation,
    scheduling, and completion summaries.
  - `packages/core/src/mailbox-repair.ts` for Mailbox repair candidate preparation and sync
    dispatch.
  - `packages/core/src/mailbox-execution-recovery.ts` for stuck Mailbox Sync Execution recovery
    and reconnect-required skip accounting.
  - `packages/core/src/mailbox-watch-renewal.ts` for watch renewal, Gmail history Cursor
    comparison, renewal failure recording, and catch-up sync dispatch.
  - `packages/core/src/control-jobs.ts` for Control Job routing plus Webhook Delivery scheduling
    recovery control-job behavior.
- Moved the remaining public use-case implementations out of `use-cases.ts` into focused modules
  so the file is no longer an implementation owner:
  - `resource-queries.ts`
  - `mailbox-connect-sessions.ts`
  - `webhook-endpoints.ts`
  - `replay-management.ts`
  - `mailbox-dispatch.ts`
- Kept existing service seams unchanged; no new core services or transport dependencies were
  introduced.

Verification:

- `pnpm exec effect-solutions list` passed before starting the slice.
- `pnpm exec effect-solutions show basics services-and-layers error-handling testing` consulted
  before moving Effect workflows.
- `pnpm --filter @mailmon/core typecheck` passes with zero warnings and zero errors.
- `pnpm --filter @mailmon/core test` passes: 5 test files, 85 tests.
- `pnpm --filter @mailmon/core format:check` passes.
- `npx fallow dead-code` passes with no issues.
- `pnpm test` passes: 17 tasks successful.
- `npx fallow health` still fails the configured threshold at `78 B`, but `use-cases.ts` is no
  longer in the hotspot list or the lowest file-health scores; churn hotspots dropped to `0`, and
  file coverage improved to `94.3%`.

Notes:

- The remaining health failures are the known later-slice targets: large test bodies, API route
  declaration, OpenAPI normalization, mailbox observability reads, and worker internal auth.
- No product behavior changes were intended.

## 2026-05-14 - Slice 5: Public Route Declaration Module

Completed the public route declaration module extraction from
`plans/mailmon-architecture-follow-up-refactor-plan.md`.

Changes:

- Reduced `apps/api/src/server.ts` to app setup, health, OAuth redirects, and OpenAPI serving.
- Added `apps/api/src/http/route-runtime.ts` for shared authenticated route execution:
  authorization, request origin calculation, typed Problem response mapping, success status
  handling, validated request access, and path parameter access.
- Added `apps/api/src/http/openapi-responses.ts` for public response schema construction and
  shared OpenAPI response helpers.
- Added `apps/api/src/http/route-specs.ts` for the CRUD-style public route registrations across
  Mailboxes, Sync Runs, Observability, Messages, Threads, Replays, Webhook Endpoints, and Webhook
  Subscriptions.
- Kept Gmail OAuth redirect routes explicit in `server.ts` because their redirect result behavior
  is different from the JSON public routes.
- Regenerated `apps/docs/api-reference/openapi.json` with the existing generator.

Verification:

- `pnpm exec effect-solutions list` passed before starting the slice.
- `pnpm exec effect-solutions show basics error-handling services-and-layers testing` consulted
  before changing Effect-adjacent route workflow code.
- `pnpm --filter @mailmon/api typecheck` passes with zero warnings and zero errors.
- `pnpm --filter @mailmon/api test` passes: 5 test files, 38 tests.
- `pnpm --filter @mailmon/api openapi:generate` passes and writes the docs OpenAPI artifact.
- `pnpm --filter @mailmon/api test -- src/public-contract.test.ts` passes against the regenerated
  OpenAPI artifact.
- `pnpm format:check` passes: 8 tasks successful.
- `npx fallow dead-code` passes with no issues.

Notes:

- Public JSON route behavior and response statuses remain covered by the existing server tests.
- Hono remains adapter-local; no HTTP details moved into `@mailmon/core`.
- No product behavior changes were intended.

## 2026-05-14 - Slice 6: Public Contract Generation Policy Module

Completed the OpenAPI normalization policy extraction from
`plans/mailmon-architecture-follow-up-refactor-plan.md`.

Changes:

- Added `apps/api/src/http/openapi-normalization.ts` as the API-local owner for generated
  OpenAPI compatibility policy:
  - camelCase request schema preference over snake_case compatibility aliases.
  - snake_case `mailbox_id` query alias removal.
  - `limit` query parameter integer/min/max normalization.
  - required `mailboxId` query parameters for message and thread list routes.
  - JSON Schema `$defs` lifting into OpenAPI components.
- Reduced `apps/api/src/generate-openapi.ts` to generator orchestration: create app, generate
  specs, normalize specs, and write the target file.
- Added focused synthetic-fragment tests in `apps/api/src/public-contract.test.ts` for the
  normalization policies while keeping the generated-document equality test.
- Regenerated `apps/docs/api-reference/openapi.json` with the existing generator.

Verification:

- `pnpm exec effect-solutions list` passed before starting the slice; no new Effect pattern was
  introduced.
- `pnpm --filter @mailmon/api test -- src/public-contract.test.ts` passes: 5 test files, 42 tests.
- `pnpm --filter @mailmon/api openapi:generate` passes and writes the docs OpenAPI artifact.
- `pnpm --filter @mailmon/api typecheck` passes with zero warnings and zero errors.
- `pnpm --filter @mailmon/api format:check` passes.
- `npx fallow dead-code` passes with no issues.

Notes:

- `apps/docs/api-reference/openapi.json` was already modified by prior public contract work; this
  slice keeps the regenerated artifact deterministic against `generateOpenApiDocument()`.
- No product behavior changes were intended.

## 2026-05-14 - Slice 7: Test Harness Surface Trim

Completed the test harness surface trim from
`plans/mailmon-architecture-follow-up-refactor-plan.md`.

Changes:

- Added a worker-local `startGcpWorkerTestRuntime(...)` scenario helper in
  `apps/worker/src/server.test.ts`.
- Rewired repeated worker internal HTTP tests to use the existing local runtime helper and the new
  GCP-authenticated runtime helper instead of spelling out the full runtime dependencies in each
  test.
- Kept the worker test helper package-local and behavior-centered; no shared `@mailmon/test`
  package was introduced.

Verification:

- `./node_modules/.bin/effect-solutions list` passed before test helper edits.
- `./node_modules/.bin/effect-solutions show testing basics` consulted before changing
  Effect-adjacent tests. `pnpm exec effect-solutions list` is currently blocked by pnpm's
  `ERR_PNPM_VERIFY_DEPS_BEFORE_RUN` lockfile checksum check and asks for `pnpm install`.
- `pnpm --filter @mailmon/worker test -- src/server.test.ts` passes: 4 test files, 33 tests.
- `pnpm --filter @mailmon/worker typecheck` passes with zero warnings and zero errors.
- `pnpm test` passes: 17 tasks successful.
- `pnpm format:check` passes: 8 tasks successful.
- `npx fallow dead-code` passes with no issues.
- `npx fallow dupes` reports 651 duplicated lines, 2.1 percent, 13 clone groups, and 2 clone
  families. This improves from the Slice 7 baseline of 939 duplicated lines, 3.1 percent, 21 clone
  groups, and 3 clone families.

Notes:

- The worker `server.test.ts` clone family was eliminated from the duplication report.
- Remaining clone families are in `packages/core/src/use-cases.test.ts` and
  `packages/gmail/src/index.test.ts`; duplication is now below the slice's 2.5 percent ideal
  target.
- No product behavior changes were intended.

## 2026-05-14 - Slice 8: Mailbox Observability Read-model Module

Completed the Mailbox Observability read-model module split from
`plans/mailmon-architecture-follow-up-refactor-plan.md`.

Changes:

- Reduced `packages/db/src/persistence/mailbox-observability-catalog.ts` so
  `getMailboxObservability(...)` coordinates named read-model pieces instead of owning every query
  and snapshot detail inline.
- Added `packages/db/src/persistence/mailbox-observability-queries.ts` for DB-internal query
  groups:
  - Mailbox operational row loading.
  - latest and latest-completed Sync Run loading.
  - 24-hour lease contention/loss metrics.
  - subscribed Webhook Endpoint rows and delivery state aggregation.
- Added `packages/db/src/persistence/mailbox-observability-read-model.ts` for pure snapshot
  assembly, including lag, Cursor movement, lease metrics, Webhook Delivery degradation rows, and
  latest Sync Run inspection mapping.
- Kept `MailboxObservabilityCatalog` and all `@mailmon/db` package exports unchanged.

Verification:

- `pnpm exec effect-solutions list` passed before starting the slice.
- `pnpm exec effect-solutions show basics services-and-layers testing` consulted before changing
  Effect-adjacent DB layer code.
- `pnpm --filter @mailmon/db test -- src/read-model.test.ts` passes: 9 test files, 44 tests.
- `pnpm --filter @mailmon/db typecheck` passes with zero warnings and zero errors.
- `pnpm --filter @mailmon/db format:check` passes.
- `npx fallow dead-code` passes with no issues.
- `npx fallow health` still fails the configured threshold at `78 B`; the observability adapter is
  no longer reported as a high-complexity function, while the remaining findings are the known
  later-slice and test-size targets.

Notes:

- Existing read-model tests already covered the important observability edges: workspace
  ownership, lag and Cursor reporting, lease metrics, shared endpoint delivery counts, zero-count
  subscribed endpoints, and non-advanced Cursor behavior.
- No product behavior changes were intended.

## 2026-05-14 - Slice 9: Worker Internal Auth Module

Completed the Worker Internal Auth module split from
`plans/mailmon-architecture-follow-up-refactor-plan.md`.

Changes:

- Added `apps/worker/src/internal-auth.ts` as the worker-local module for internal request
  authorization.
- Moved bearer token extraction, Google OIDC verification wrapping, trusted issuer/audience checks,
  verified service account checks, allow-list matching, and auth failure response bodies out of
  `apps/worker/src/server.ts`.
- Kept route registration and internal route specs in `apps/worker/src/server.ts`, which now only
  calls `authorizeInternalRequest(...)` from the middleware.
- Extended `apps/worker/src/server.test.ts` coverage for invalid tokens, untrusted issuers,
  untrusted audiences, unverified service account emails, and unauthorized service accounts while
  preserving local-mode bypass and non-local startup auth requirements.

Verification:

- `pnpm exec effect-solutions list` passed before starting the slice.
- `pnpm exec effect-solutions show basics error-handling testing` consulted before moving
  Effect-adjacent worker server code.
- `pnpm --filter @mailmon/worker test -- src/server.test.ts` passes: 4 test files, 37 tests.
- `pnpm --filter @mailmon/worker typecheck` passes with zero warnings and zero errors.
- `pnpm --filter @mailmon/worker format:check` passes.
- `npx fallow health` still fails the configured threshold at `78 B`; after the test fixture
  cleanup it reports 13 high-complexity functions, with no new `server.test.ts` verifier
  complexity finding from this slice.

Notes:

- The local-mode auth bypass remains in `authorizeInternalRequest(...)` so internal routes continue
  to run unauthenticated for local transport.
- The default Google OIDC verifier remains worker-local and is only used when tests or callers do
  not inject a verifier.
- No product behavior changes were intended.
