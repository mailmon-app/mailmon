# Architecture Refactor Log

Reference plan: [plans/mailmon-architecture-deepening-refactor-plan.md](../plans/mailmon-architecture-deepening-refactor-plan.md)

## 2026-05-12

### Current Position

Completed Slice 1: Test Harness Deepening.

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

### Next

Start Slice 2: Webhook Delivery Request-Building Module from the referenced architecture plan.

Recommended first actions:

- Add the fixed core unit test for `PreparedWebhookDelivery` request body, signature, and headers.
- Extract the transport-neutral signature/header builder into `@mailmon/core`.
- Keep timeout, abort, fetch, and local-forwarding wording in the worker and CLI adapters.
