# Mailmon Follow-up Refactor Analysis

Date: 2026-05-14

Scope reviewed:

- Plan: `plans/mailmon-architecture-follow-up-refactor-plan.md`
- Implementation log: `docs/history/implementation-logs/follow-up.md`
- Current code shape across slices 0 through 9
- Cross-slice verification run after the review

Note: the request named `log/followup-refactor-analysis.md`, but this repo already uses
`docs/history/implementation-logs/` and has no `log/` directory. This analysis stays in the archived implementation-log convention.

## Executive Summary

The follow-up refactor achieved its main architectural goal. The largest shallow implementation
owners were split into focused Modules without moving transport or persistence details into
`@mailmon/core`, and without widening package-level public interfaces.

The strongest outcomes are:

- `packages/core/src/use-cases.ts` is now a 39-line compatibility export Module instead of a mixed
  workflow implementation owner.
- `packages/gmail/src/index.ts` is now a 15-line public entry Module instead of owning Gmail
  encryption, projection, provider workflow assembly, and stub behavior.
- The old DB persistence mapper grab bag was deleted and replaced by domain-focused DB-internal
  mapper Modules.
- API public route execution now crosses a named API-local route runtime Module, with Hono kept
  in the API adapter.
- Mailbox Observability reads now coordinate named query and read-model Modules instead of
  concentrating every query and snapshot detail in one function.
- Worker internal auth now has an adapter-local Module with direct failure-mode coverage.

The refactor is acceptable as an architecture pass, but two follow-up fixes should be prioritized:

1. Worker internal auth should reject tokens when `email_verified` is missing, not only when it is
   explicitly `false`.
2. OpenAPI `$defs` lifting should rewrite `#/$defs/...` references or avoid deleting `$defs` when
   those references exist.

## Verification

Commands run during this review:

| Command                | Result              | Notes                                                                                                                           |
| ---------------------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm build`           | Passes              | Known CLI tsdown dependency-bundling hint remains.                                                                              |
| `pnpm lint`            | Passes              | 13 tasks successful, zero warnings/errors.                                                                                      |
| `pnpm typecheck`       | Passes              | 13 tasks successful, zero warnings/errors.                                                                                      |
| `pnpm test`            | Passes              | 17 tasks successful, 263 tests passing.                                                                                         |
| `pnpm format:check`    | Passes              | 8 tasks successful.                                                                                                             |
| `pnpm db:generate`     | Passes              | Drizzle reports 14 tables and no schema changes.                                                                                |
| `npx fallow dead-code` | Passes              | No issues found.                                                                                                                |
| `npx fallow dupes`     | Reports duplication | 651 duplicated lines, 2.1%, 13 clone groups, 2 clone families. This is below the plan baseline and below the 2.5% ideal target. |
| `npx fallow health`    | Fails threshold     | Health score remains `78 B`; deductions are hotspots `-10.0`, unit size `-10.0`, coupling `-1.8`.                               |

Current tracked diff before this analysis file was only:

- `apps/docs/api-reference/openapi.json` regenerated and modified.

There are also unrelated untracked files already present under Cloudflare/infra planning paths.

## Architecture Outcome by Slice

### Slice 0: Fallow Baseline Cleanup

Result: successful.

Dead exports are now `0.0%`, and `npx fallow dead-code` is clean. This matters because the later
architecture slices now have a useful signal: new unused exports are more likely to be real
interface growth instead of inherited noise.

The cleanup also tightened test-harness and package metadata surfaces without changing product
behavior.

### Slice 1: DB Persistence Mapper Partition

Result: successful.

The broad `packages/db/src/persistence/mappers.ts` Module was deleted. The replacement Modules
match the domain ownership described in the plan:

- `common-mappers.ts`
- `pagination-cursors.ts`
- `public-resource-mappers.ts`
- `canonical-state-mappers.ts`
- `mailbox-event-mappers.ts`
- `webhook-delivery-mappers.ts`
- `operational-state-mappers.ts`

This improves locality: Canonical Mailbox State commit, Mailbox Event construction, Webhook
Delivery recovery, pagination, and public resource mapping no longer share one oversized
implementation dependency.

The deletion test supports keeping these Modules: deleting them would push row mapping, Cursor
encoding, stable identity construction, and transition update logic back into multiple DB
adapters.

### Slice 2: Gmail Package Internal Ownership

Result: successful.

`packages/gmail/src/index.ts` is now a public entry Module that re-exports service tags, public
types, and layer factories. Gmail-specific implementation knowledge moved to focused Modules:

- refresh-token cipher behavior
- Gmail-to-Canonical Mailbox State projection
- connect workflows
- sync workflows
- watch workflows
- deterministic stub sync behavior

This is the right Module depth. Callers still learn the stable `@mailmon/gmail` interface, while
maintainers get locality for encryption, projection, and workflow assembly.

No new `Context.Service` seam was introduced, which matches the plan's "one adapter means a
hypothetical seam" rule.

### Slice 3: Webhook Delivery Execution Module

Result: successful.

`packages/core/src/webhook-delivery-execution.ts` now owns:

- endpoint response classification
- transport failure classification
- retry delay policy
- retry exhaustion wording
- completion construction
- compare-and-swap finalization
- retry rescheduling

This is a coherent deep Module. The public `runWebhookDelivery(...)` export remains stable through
`use-cases.ts`, while the delivery policy now has a direct test surface through
`webhook-delivery-execution.test.ts`.

The existing `WebhookDeliveryStore`, `WebhookDeliverySender`, and `WebhookDeliveryScheduler`
service seams remain intact.

### Slice 4: Core Workflow Partition

Result: successful.

`packages/core/src/use-cases.ts` no longer owns workflow implementation. It now forwards to named
workflow Modules:

- `resource-queries.ts`
- `mailbox-connect-sessions.ts`
- `mailbox-dispatch.ts`
- `mailbox-watch-renewal.ts`
- `mailbox-repair.ts`
- `mailbox-execution-recovery.ts`
- `replay-management.ts`
- `replay-dispatch.ts`
- `webhook-endpoints.ts`
- `control-jobs.ts`

This is the most important locality win in the refactor. The public core use-case interface stays
stable, but maintainers no longer need to scan unrelated Replay, Mailbox repair, watch renewal,
Webhook Delivery, and resource query code in one file.

Core remains transport-neutral: no Hono, Pub/Sub, Cloud Tasks, BullMQ, Drizzle, or Postgres details
entered `@mailmon/core`.

### Slice 5: Public Route Declaration Module

Result: successful with one residual hotspot.

Public JSON route execution now crosses `apps/api/src/http/route-runtime.ts`, and CRUD-style route
registration lives in `apps/api/src/http/route-specs.ts`. This concentrates repeated auth,
Problem Envelope mapping, validated request access, response status handling, and origin
calculation.

`apps/api/src/server.ts` now owns app setup, health, OAuth redirects, OpenAPI serving, and route
registration. That is a better shape than the previous route-body bulk.

Residual risk: `apps/api/src/server.ts` still appears in `fallow health` as a hotspot because the
Gmail OAuth callback remains a 56-line branchy handler. The plan intentionally left OAuth routes
explicit because redirect behavior differs from JSON routes. This is acceptable for this refactor,
but it is the next API-local candidate if OAuth behavior grows.

### Slice 6: Public Contract Generation Policy Module

Result: mostly successful; one correctness gap.

OpenAPI compatibility policy now lives in `apps/api/src/http/openapi-normalization.ts`, while
`apps/api/src/generate-openapi.ts` is generator orchestration. This gives the public contract
policy its own test surface.

The generated OpenAPI artifact is deterministic under `generateOpenApiDocument()`, and the public
contract tests pass.

However, the `$defs` lifting policy is incomplete. See Review Finding 2.

### Slice 7: Test Harness Surface Trim

Result: partially successful and good enough for this pass.

The worker server test clone family was removed, and duplication improved materially:

- Plan baseline: 971 duplicated lines, 3.2%, 22 clone groups.
- Current review: 651 duplicated lines, 2.1%, 13 clone groups.

Remaining clone families are concentrated in:

- `packages/core/src/use-cases.test.ts`
- `packages/gmail/src/index.test.ts`

This is below the plan's ideal 2.5% target. I would stop here unless future work touches those
tests, because extracting helpers from long behavior tests can reduce readability if the helper
interface becomes broader than the behavior it hides.

### Slice 8: Mailbox Observability Read-model Module

Result: successful.

`packages/db/src/persistence/mailbox-observability-catalog.ts` now coordinates:

- `mailbox-observability-queries.ts`
- `mailbox-observability-read-model.ts`

The external `MailboxObservabilityCatalog` seam stays unchanged, while the implementation now
separates DB query groups from pure snapshot assembly.

This is a good internal-seam use: it improves locality without widening `@mailmon/db` exports.

### Slice 9: Worker Internal Auth Module

Result: successful shape, but one auth correctness issue.

`apps/worker/src/internal-auth.ts` now owns bearer extraction, Google OIDC verification wrapping,
issuer/audience checks, service account allow-list checks, local-mode bypass, and auth failure
responses. `apps/worker/src/server.ts` now delegates internal route authorization to that Module.

The Module is adapter-local, which is the right placement. This policy should not move into core.

The test coverage added for invalid tokens, untrusted issuer, untrusted audience, unverified
email, unauthorized service account, local bypass, and non-local startup requirements is useful.

The remaining issue is that missing `email_verified` is accepted. See Review Finding 1.

## Review Findings

### 1. Worker internal auth accepts missing email verification

Severity: high.

File: `apps/worker/src/internal-auth.ts`

`createGoogleOidcVerifier(...)` maps a missing `email_verified` payload claim to
`emailVerified: null`. `authorizeInternalRequest(...)` then rejects only
`verifiedToken.emailVerified === false`.

That means a token with:

- trusted issuer
- matching audience
- allow-listed email
- no `email_verified` claim

would be authorized. The internal auth interface calls this a verified service account check, so
missing verification should fail closed.

Recommended fix:

- Change the check to require `verifiedToken.emailVerified === true`.
- Add a test token with `emailVerified: null` and assert the existing
  `worker_internal_auth_forbidden` missing verified service account response.

Suggested condition:

```ts
if (verifiedToken.email === null || verifiedToken.emailVerified !== true) {
  // forbidden: missing a verified service account
}
```

### 2. OpenAPI `$defs` lifting can leave dangling local `$ref` values

Severity: medium.

Files:

- `apps/api/src/http/openapi-normalization.ts`
- `apps/api/src/public-contract.test.ts`

The normalizer moves `$defs` entries into `components.schemas` and then deletes the source
`$defs`, but it does not rewrite references such as `#/$defs/Message` to
`#/components/schemas/Message`.

The synthetic test fixture includes this exact local reference, but the assertion only checks that
`$defs` disappeared and component schemas exist. It does not check that `properties.data.$ref`
remains valid.

Current generated `apps/docs/api-reference/openapi.json` does not contain `#/$defs` references, so
this is not breaking the checked-in artifact today. It is still a correctness gap in the contract
policy Module: the advertised "lift `$defs` into OpenAPI components" behavior should preserve
reference integrity.

Recommended fix:

- Rewrite `#/$defs/<Name>` references to `#/components/schemas/<Name>` while lifting.
- Extend the existing synthetic test to assert the rewritten `$ref`.
- If nested `$defs` can shadow names, define and test the collision behavior before rewriting.

### 3. Route-specific response mapping can drift from core resource contracts

Severity: low.

File: `apps/api/src/http/route-specs.ts`

`toSyncRunsResponse(...)` manually remaps every `MailboxSyncRunInspectionResource` field. This is
not currently wrong, but it creates a second response-shape owner for Sync Run inspection data.

If `@mailmon/core` adds a field to `MailboxSyncRunInspectionResource`, the API route may silently
drop it while the OpenAPI schema or core contract moves on.

Recommended options:

- Prefer returning the core resource unchanged if the transport no longer needs a shape workaround.
- If the manual map is required for OpenAPI stability, add a short comment explaining the contract
  policy and keep `public-contract.test.ts` as the guard.

## Residual Architecture Risks

### Health score remains capped by test size

`npx fallow health` remains `78 B`. The current failure is not primarily due to the refactored
production Modules. The biggest deductions are:

- Large behavior tests in Gmail, core, worker, API, and DB.
- Residual complexity in API OpenAPI normalization, Gmail OAuth/history helpers, DB adapters, and
  worker internal route interpretation.
- Hotspot history on `apps/api/src/server.ts` and `apps/worker/src/server.ts`.

This is acceptable after an architecture pass focused on production Module locality, but it means
`fallow health` should not yet be treated as a release gate without either raising the target work
or suppressing deliberate long behavior tests.

### API route declarations are deeper, not fully data-driven

`route-specs.ts` still contains Hono route declarations and request-to-use-case adapters. That is
appropriate because Hono remains the API adapter. The refactor improved locality by extracting
shared execution behavior, but adding a route still requires understanding Hono metadata,
validation, and handler mapping in one place.

That is a reasonable tradeoff. A more generic route DSL would likely become a shallow Module unless
more route families emerge.

### Compatibility aliases remain product policy

Request compatibility still accepts snake_case aliases in runtime parsers while the public OpenAPI
document prefers camelCase. This is intentional public contract policy. If the compatibility period
or deprecation strategy changes, it should be recorded as an ADR or equivalent decision record.

## Recommended Next Work

1. Fix worker internal auth to require `emailVerified === true`.
2. Fix OpenAPI `$defs` lifting to rewrite references and test the rewritten `$ref`.
3. Decide whether the generated OpenAPI artifact shape change is ready to commit as-is. The
   artifact is deterministic and tests pass, but the diff is large.
4. Leave remaining test duplication alone until touching the relevant behavior tests. The current
   2.1% duplication is below the plan target.
5. Consider a focused future pass on `apps/api/src/server.ts` OAuth redirects only if Gmail
   connect behavior grows; it does not need to block this refactor.

## Final Assessment

This refactor deepened the right Modules and preserved the important seams:

- Mailbox stays the unit of work.
- Canonical Mailbox State durability still precedes Cursor advancement.
- Mailbox Event construction remains tied to durable state writes.
- Webhook Delivery scheduling remains driven from durable Mailbox Event rows.
- Gmail behavior stays in `@mailmon/gmail`.
- Core remains transport-neutral.
- New service seams were avoided where only internal locality was needed.

The refactor should be considered successful after the two follow-up correctness fixes above.
