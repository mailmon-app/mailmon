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
