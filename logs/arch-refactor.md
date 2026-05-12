# Architecture Refactor Log

Reference plan: [plans/mailmon-architecture-deepening-refactor-plan.md](../plans/mailmon-architecture-deepening-refactor-plan.md)

## 2026-05-12

### Current Position

Completed Slice 2: Webhook Delivery Request-Building Module.

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

### Next

Start Slice 3: Worker Internal HTTP Route Interpreter from the referenced architecture plan.

Recommended first actions:

- Identify the repeated internal HTTP route interpretation shape in `apps/worker/src/server.ts`.
- Extract request decoding, problem mapping, and workflow invocation into a route interpreter Module.
- Keep Hono-specific response mechanics in the worker adapter.
