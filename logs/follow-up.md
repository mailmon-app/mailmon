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
