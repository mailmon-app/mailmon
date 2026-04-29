# API Effect-Aligned Refactor Design (apps/api)

Date: 2026-04-29
Scope: `apps/api` only
Goal: Remove adapter bloat and improve Effect alignment without sacrificing correctness.

## Context

- Product truth and architecture constraints come from `docs/PRD.md`, `plans/mailmon-gmail-sync-infrastructure.md`, and `UBIQUITOUS_LANGUAGE.md`.
- `apps/api` must remain a thin Hono HTTP adapter that delegates product logic to `@mailmon/core` use cases.
- Mailbox remains the unit of work, and API failures must use Problem Envelope responses.

## Non-Goals

- No domain workflow rewrites in `@mailmon/core`.
- No transport model changes in this pass.
- No public endpoint removals.

## Approaches Considered

1. Route-interpreter refactor (recommended)
   - Factor shared auth/validation/effect-execution behavior into reusable adapter helpers.
   - Keep route declarations in Hono while reducing repeated boilerplate.
2. Full schema-first decoding everywhere
   - Stronger runtime validation model, but larger immediate behavior surface changes.
   - _Note on tooling:_ When this is adopted, we should evaluate official integrations like `@hono/effect-validator` for native Effect Schema middleware and `hono-openapi` to auto-generate the OpenAPI spec directly from route schemas.
3. Minimal dedupe only
   - Low risk but preserves most current bloat and inconsistency.

Decision: Use approach 1 now, then incrementally adopt stricter schema-first decoding in follow-up passes.

## Target Architecture

### 1) Keep apps/api as a pure adapter

- `server.ts` should primarily declare routes and call core use cases.
- Shared adapter orchestration moves into internal HTTP helpers.

### 2) Introduce adapter helper modules

Planned internal modules:

- `apps/api/src/http/handlers.ts`
  - workspace auth wrapper
  - Effect execution + Problem Envelope mapping helper
  - common request guard helpers
- `apps/api/src/http/parsers.ts`
  - body and query decoding helpers
  - typed parse results or Problem Envelope failures
  - _Future target:_ Migrate to `@hono/effect-validator` when moving to full schema-first decoding.

### 3) Runtime composition stays stable

- Keep `apps/api/src/runtime.ts` behavior intact.
- Optionally simplify async transport mode branching into a mode-to-layer helper for readability.
- Preserve fail-fast behavior for `legacy_bullmq` in API runtime.

## Request Flow Pattern

Each protected endpoint follows one pattern:

1. Authenticate workspace API key.
2. Decode and validate path/query/body input.
3. Execute core use case via runtime.
4. Convert success/error into HTTP response.

This removes route-level bespoke control flow and centralizes response semantics.

## Correctness and Behavior Tightening

User-approved constraint: small behavior tightenings are allowed if documented.

Planned tightenings:

- Normalize malformed JSON body handling to deterministic `400 invalid_request` responses with clear route-level detail.
- Normalize invalid list query handling (`limit`, required mailbox query parameters) to deterministic error responses.
- Ensure webhook event type validation failures produce stable Problem Envelope details.
- Keep OAuth redirect contract stable while consolidating callback error parameter mapping into one helper.

## Testing Strategy

### Unit and route tests

- Keep `apps/api/src/server.test.ts` as route contract coverage.
- Add/adjust focused tests for parser helpers and normalized invalid-input behaviors.

### Integration guardrail

- Keep `apps/api/src/sandbox-e2e.test.ts` intact as an end-to-end flow check.

### Verification commands

- `pnpm test --filter @mailmon/api`
- `pnpm typecheck`
- `pnpm lint` (if touched files trigger lint scope)

## Change Log Requirements

Document in the implementation PR/commit notes:

- Which behaviors were tightened.
- Which error response details changed and why.
- Evidence that public route contracts remain correct through tests.

## Risks and Mitigations

- Risk: silent behavior drift in edge-case request validation.
  - Mitigation: explicit regression tests for invalid inputs and query/body aliases.
- Risk: moving helper logic could obscure route intent.
  - Mitigation: keep helpers small and route handlers declarative.
- Risk: over-abstraction in adapter.
  - Mitigation: only extract repeated patterns used by multiple routes.

## Rollout Plan (apps/api pass)

1. Introduce helper modules and keep existing behavior where possible.
2. Migrate routes incrementally to helper pipeline.
3. Add tests for normalized validation behavior.
4. Run API test suite and workspace typecheck.
5. Document user-approved behavior tightenings.

## Implementation Notes

- Added `apps/api/src/http/parsers.ts` for non-throwing request-boundary decoding.
- Added `apps/api/src/http/handlers.ts` for shared bearer auth, Effect execution, and Problem Envelope response mapping.
- Kept Hono route declarations in `apps/api/src/server.ts`; routes now follow the auth, parse, execute, respond pipeline.
- Kept runtime behavior stable while extracting API async transport mode selection into a small helper.
- Documented user-visible validation tightenings in `docs/plans/2026-04-29-api-effect-refactor-change-log.md`.
