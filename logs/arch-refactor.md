# Architecture Refactor Log

Reference plan: [plans/mailmon-architecture-deepening-refactor-plan.md](../plans/mailmon-architecture-deepening-refactor-plan.md)

## 2026-05-12

### Current Position

Completed Slice 7: Canonical Mailbox State Commit Module

### Slice 0 What Changed

- Fixed the API OpenAPI response helper in `apps/api/src/server.ts` by removing the unnecessary generic and unsafe `schema as never` assertion.
- Tightened worker processor runtime typing in `apps/worker/src/processor.ts` so each processor accepts a runtime for the exact Effect it executes.
- Replaced unsafe runtime test double casts in `apps/worker/src/processor.test.ts` with typed `satisfies` stubs.
- Updated `docs/plans/2026-05-11-effect-v4-migration-plan.md` to clarify that the migration breakage inventory is historical and that the residual warning cleanup was resolved on 2026-05-12.
- Formatted the Slice 0 files plus additional formatting drift revealed by `pnpm format:check`:
  - `packages/config/src/index.ts`
  - `packages/queue/src/index.ts`
  - `apps/cli/src/app.ts`
  - `apps/cli/src/index.ts`
  - `packages/db/src/bootstrap.ts`
  - `packages/db/src/replay.test.ts`

### Slice 0 Verification

- `pnpm build`: passed.
- `pnpm lint`: passed with zero warnings.
- `pnpm typecheck`: passed with zero warnings.
- `pnpm test`: passed.
- `pnpm format:check`: passed.
- `pnpm db:generate`: passed with no schema changes.

### Slice 1 What Changed

- Added `apps/api/src/test-harness.ts` with package-local API route fixtures and `createApiRouteTestRuntime(...)`.
- Replaced the duplicate runtime setup in `apps/api/src/server.test.ts` with the API route harness.
- Reused the sandbox e2e harness in the happy-path test instead of re-declaring API/worker runtime environment setup.
- Added worker internal HTTP test helpers for default runtime startup and JSON internal requests.
- Added Gmail test response builders and a Gmail sync provider invocation helper.
- Kept the remaining API/core fixture overlap package-local. The previous 403-line API/core clone family is reduced to a 47-line fixture-shaped overlap, which is not worth a shared package yet because `@mailmon/core` does not export test utilities and Slice 1 explicitly avoids a global `@mailmon/test` package.

### Slice 1 Verification

- `pnpm --filter @mailmon/api test`: passed.
- `pnpm --filter @mailmon/worker test`: passed.
- `pnpm --filter @mailmon/core test`: passed.
- `pnpm --filter @mailmon/gmail test`: passed.
- `npx fallow dupes`: passed; duplicate percentage dropped from 7.1% to 3.4%.
- `pnpm build`: passed.
- `pnpm lint`: passed with zero warnings.
- `pnpm typecheck`: passed with zero warnings.
- `pnpm test`: passed.
- `pnpm format:check`: passed.
- `pnpm db:generate`: passed with no schema changes.

### Slice 2 What Changed

- Added `packages/core/src/webhook-delivery-request.ts` as the transport-neutral owner of:
  - canonical webhook delivery JSON body encoding.
  - HMAC signature construction.
  - Mailmon delivery HTTP headers.
  - shared transport failure classification with adapter-specific timeout wording.
- Added a fixed core unit test for `PreparedWebhookDelivery` body, headers, and signature.
- Replaced duplicate worker request body/header/signature construction with the shared core builder.
- Replaced duplicate CLI local-forwarding request body/header/signature construction with the shared core builder while preserving the CLI test signing secret override.
- Added CLI forwarding coverage to assert local delivery headers and signatures remain compatible with worker delivery.

### Slice 2 Verification

- `pnpm --filter @mailmon/core test`: passed.
- `pnpm --filter @mailmon/core build`: passed; needed before adapter tests because worker and CLI import `@mailmon/core` through the package export.
- `pnpm --filter @mailmon/worker test -- src/runtime.test.ts`: passed.
- `pnpm --filter @mailmon.dev/cli test -- src/app.test.ts`: passed.
- `pnpm typecheck`: passed with zero warnings.
- `pnpm format:check`: passed.

### Slice 3 What Changed

- Added `apps/worker/src/internal-route-interpreter.ts` as the worker-local owner of internal route JSON reading, domain payload decoding, processor lookup, `ProblemDetails` mapping, and unknown failure responses.
- Moved the `WorkerHttpProcessors` service tag into the interpreter module while keeping `ManagedRuntime` at the worker HTTP adapter edge.
- Rebuilt the five internal routes in `apps/worker/src/server.ts` through route specs for:
  - `/internal/sync`
  - `/internal/sync-dead-letter`
  - `/internal/gmail-push`
  - `/internal/webhook-deliveries`
  - `/internal/control-jobs`
- Preserved route-specific behavior as spec data or small callbacks, including dead-letter invalid-envelope logging, Gmail push local-mode precondition handling, and dead-letter `ProblemDetails` status clamping.
- Added worker server tests for local-mode Gmail push precondition behavior, invalid control job payloads, and unknown processor failures.

### Slice 3 Verification

- `pnpm exec effect-solutions list`: passed.
- `pnpm exec effect-solutions show basics services-and-layers error-handling testing data-modeling`: passed.
- `pnpm --filter @mailmon/worker test -- src/server.test.ts`: passed; 33 tests passed across the matched worker test files.
- `pnpm --filter @mailmon/worker build`: passed.
- `pnpm --filter @mailmon/worker typecheck`: passed with zero warnings.
- `pnpm format:check`: passed.
- `npx fallow dupes`: passed; duplicate percentage is now 3.3%, with remaining worker duplication concentrated in GCP runtime setup inside `apps/worker/src/server.test.ts`.

### Slice 4 What Changed

- Split Gmail HTTP adapter internals out of `packages/gmail/src/index.ts` while keeping the public package exports stable.
- Added package-private Gmail modules for:
  - HTTP URL construction and JSON request helpers in `packages/gmail/src/http-client.ts`.
  - ProblemDetails and Gmail rate-limit/reconnect classification in `packages/gmail/src/problems.ts`.
  - Gmail response parsing in `packages/gmail/src/parsers.ts`.
  - OAuth token refresh and authorization-code exchange in `packages/gmail/src/oauth.ts`.
  - History pagination and compaction in `packages/gmail/src/history.ts`.
  - The remaining HTTP Gmail API assembly in `packages/gmail/src/http-api.ts`.
- Removed the large inline `listHistoryDelta` implementation from `packages/gmail/src/index.ts`; history compaction now has a named local owner.
- Added regression coverage for:
  - Gmail history pages with no `history` array but a higher `historyId`.
  - changed messages that return 404 before they can be fetched.
- Preserved initial sync behavior, incremental Cursor behavior, 404 history cursor invalid mapping, and Gmail 403/429 rate-limit mapping.

### Slice 4 Verification

- `pnpm exec effect-solutions list`: passed.
- `pnpm exec effect-solutions show basics services-and-layers error-handling testing data-modeling`: passed.
- `pnpm --filter @mailmon/gmail test`: passed; 20 tests passed.
- `pnpm --filter @mailmon/gmail build`: passed.
- `pnpm --filter @mailmon/gmail typecheck`: passed with zero warnings.
- `pnpm --filter @mailmon/gmail format:check`: passed.
- `pnpm typecheck`: passed with zero warnings.
- `npx fallow health`: still exits nonzero because existing repo-wide thresholds remain, but the health score improved to `78 B`; `packages/gmail/src/index.ts` is no longer a top file-health issue, `createHttpGmailApi` dropped out of the top large-function list, and Gmail no longer appears in the refactoring-target list.

### Next

Start Slice 5: DB Persistence Adapter Partition from the referenced architecture plan.

Recommended first actions:

- Identify low-risk adapter groups inside `packages/db/src/persistence.ts` before moving commit-critical code.
- Partition unrelated persistence adapters first so later Canonical Mailbox State commit work has a smaller diff surface.
- Keep existing core service seams stable unless a real adapter/testing boundary needs to change.

## 2026-05-13

### Slice 5 What Changed

- Partitioned `packages/db/src/persistence.ts` into adapter-owned internal modules under `packages/db/src/persistence/`.
- Kept `packages/db/src/persistence.ts` as a public compatibility barrel for existing `@mailmon/db` imports.
- Moved common persistence pieces into:
  - `persistence/database.ts` for `MailmonDatabase`, `createDatabaseLayer`, and scoped operator DB access.
  - `persistence/mappers.ts` for row/resource mapping, timestamp conversion, cursor encoding/decoding, and canonical mailbox state helpers.
  - `persistence/problems.ts` for adapter problem construction and Postgres error classification.
  - `persistence/layers.ts` for `createPersistenceServicesLayer`, `createCorePersistenceLayer`, and `createWorkerPersistenceLayer`.
- Moved service adapters into ownership files for workspace API keys, mailbox catalogs, connect sessions, sync runs, mailbox sync coordination, mailbox state, watch/repair/recovery stores, webhook endpoints, webhook deliveries, replays, and Gmail credentials.
- Preserved existing core and Gmail service seams; no new service seam was added for mappers or problem helpers.

### Slice 5 Verification

- `pnpm exec effect-solutions list`: passed.
- `pnpm exec effect-solutions show basics services-and-layers error-handling testing data-modeling`: passed.
- `pnpm --filter @mailmon/db format`: passed.
- `pnpm --filter @mailmon/db lint`: passed with zero warnings.
- `pnpm --filter @mailmon/db typecheck`: passed with zero warnings.
- `pnpm --filter @mailmon/db test`: passed; 43 tests passed across 9 test files.
- `pnpm --filter @mailmon/db build`: passed.
- `pnpm db:generate`: passed with no schema changes.
- `npx fallow health`: still exits nonzero because existing repo-wide thresholds remain. `packages/db/src/persistence.ts` is no longer a monolith or hotspot; it is now a 51-line barrel. The health report now surfaces follow-up DB risk in `persistence/mappers.ts`, `persistence/mailbox-state-store.ts`, and `persistence/mailbox-observability-catalog.ts`, which aligns with later Slice 7 commit-module work.

### Slice 6 What Changed

- Added `packages/core/src/mailbox-operational-state.ts` as the transport-neutral owner of Mailbox operational transition policy.
- Moved terminal Gmail credential/sync problem classification into core policy helpers.
- Added core transition coverage for:
  - terminal Gmail token/credential failures.
  - missing Gmail credentials.
  - invalid Gmail history cursor.
  - Gmail rate limiting.
  - mailbox cursor regression.
  - dispatch retry exhaustion.
  - lease loss and generic failed-after-lease-acquired sync failures.
  - watch renewal failures before and after watch expiration.
  - unreadable credential rewrap handling.
  - stuck execution recovery.
- Replaced DB-side `getMailboxSyncFailureState` product policy with `transitionForCompletedSyncRun(...)`.
- Replaced inline DB Last Error/status/sync/watch policy updates in sync dispatch exhaustion, watch renewal failure, Gmail credential rewrap, and stuck execution recovery with core transitions plus DB-only update mapping.
- Preserved Canonical Mailbox State commit ordering; Slice 7 remains responsible for extracting that transaction.

### Slice 6 Verification

- `pnpm exec effect-solutions list`: passed.
- `pnpm exec effect-solutions show basics services-and-layers error-handling testing data-modeling`: passed.
- `pnpm --filter @mailmon/core test -- src/mailbox-operational-state.test.ts`: passed; 78 tests passed across 4 core test files.
- `pnpm --filter @mailmon/core typecheck`: passed with zero warnings.
- `pnpm --filter @mailmon/core build`: passed.
- `pnpm --filter @mailmon/core format:check`: passed.
- `pnpm --filter @mailmon/db typecheck`: passed with zero warnings.
- `pnpm --filter @mailmon/db test -- src/mailbox-repair.test.ts`: passed; the DB package suite ran with 43 tests across 9 files.
- `pnpm --filter @mailmon/db test -- src/gmail-credentials.test.ts`: passed; the DB package suite ran with 43 tests across 9 files.
- `pnpm --filter @mailmon/db test -- src/mailbox-sync-dispatch-exhaustion.test.ts`: passed; the DB package suite ran with 43 tests across 9 files.
- `pnpm --filter @mailmon/db build`: passed.
- `pnpm --filter @mailmon/db format:check`: passed.
- `pnpm typecheck`: passed with zero warnings.
- `pnpm format:check`: passed.

### Slice 7 What Changed

- Added `packages/db/src/persistence/mailbox-sync-commit.ts` as the DB-internal owner of the Canonical Mailbox State commit transaction.
- Kept `MailboxStateStore.applySyncResult(...)` as the external core service seam and kept a single top-level Drizzle transaction in `packages/db/src/persistence/mailbox-state-store.ts`.
- Split the transaction implementation into named commit helpers for:
  - active lease validation.
  - Cursor regression guard.
  - Mailbox Event identity validation.
  - Message row lookup and canonical Message upserts.
  - delete-only Message application and empty Thread cleanup.
  - affected Thread calculation and Thread recalculation.
  - Mailbox Event insertion.
  - Mailbox and Sync Run finalization.
- Added regression coverage proving a stale lease owner does not advance the Cursor, write canonical state, emit Mailbox Events, clear the active lease, or complete the Sync Run.
- Preserved existing Cursor regression, duplicate event, delete-only Thread recalculation, and rollback behavior.

### Slice 7 Verification

- `pnpm exec effect-solutions list`: passed.
- `pnpm exec effect-solutions show basics services-and-layers error-handling testing data-modeling`: passed.
- `pnpm --filter @mailmon/db format`: passed.
- `pnpm --filter @mailmon/db typecheck`: passed with zero warnings.
- `pnpm --filter @mailmon/db lint`: passed with zero warnings.
- `pnpm --filter @mailmon/db test -- src/mailbox-event-emission.test.ts`: passed; the DB package suite ran with 44 tests across 9 files.
- `pnpm --filter @mailmon/db build`: passed.
- `pnpm --filter @mailmon/core test`: passed; 78 tests passed across 4 files.
- `pnpm typecheck`: passed with zero warnings.
- `pnpm --filter @mailmon/db format:check`: passed.
- `npx fallow health`: still exits nonzero because existing repo-wide thresholds remain. Health improved to `77 B`; `packages/db/src/persistence/mailbox-state-store.ts` is now a 54-line coordinator with low risk, and the old commit transaction risk is distributed into the named `mailbox-sync-commit.ts` Module.

### Next

Start Slice 8: Public Route Contract Module from the referenced architecture plan.

Recommended first actions:

- Identify the current public route/OpenAPI contract duplication in `apps/api/src/server.ts`.
- Keep Hono as the public HTTP adapter while moving route contract shape into a named module.
- Preserve existing response schemas and generated OpenAPI behavior before changing any route implementation.
