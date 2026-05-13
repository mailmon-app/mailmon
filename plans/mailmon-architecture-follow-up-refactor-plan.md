# Plan: Mailmon Architecture Follow-up Refactors

> Previous refactor plan: `plans/mailmon-architecture-deepening-refactor-plan.md`
> Implementation log: `logs/arch-refactor.md`
> Domain language: `UBIQUITOUS_LANGUAGE.md`
> Current date: 2026-05-13

## Purpose

The first architecture deepening pass completed its intended slices:

- Webhook Delivery request construction moved into `@mailmon/core`.
- Worker internal route interpretation moved behind one worker-local Module.
- Gmail HTTP adapter internals were split out of the public package entry point.
- DB persistence moved from one large file into adapter-owned internal Modules.
- Mailbox operational state policy moved into core.
- Canonical Mailbox State commit behavior moved behind a named DB-internal Module.
- Public HTTP response contracts moved into core Schema definitions.

This follow-up plan captures the remaining refactoring work where complexity still sits in
shallow or over-broad Modules. The goal is not to change product semantics. The goal is to
increase depth, locality, and test leverage around the remaining high-risk Mailbox workflows:

- Canonical Mailbox State commit mapping and Mailbox Event construction.
- Gmail credential encryption, Gmail-to-canonical projection, and provider workflow assembly.
- Webhook Delivery execution classification and retry policy.
- Public HTTP route declarations and OpenAPI normalization.
- Test harness surface area and repeated scenario setup.
- Mailbox observability reads and worker internal auth interpretation.

## Current Baseline

Commands run while creating this plan:

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

Current results:

| Command                | Result                  | Notes                                                           |
| ---------------------- | ----------------------- | --------------------------------------------------------------- |
| `pnpm build`           | Passes                  | CLI build still emits tsdown dependency-bundling hints.         |
| `pnpm lint`            | Passes                  | Zero warnings and zero errors.                                  |
| `pnpm typecheck`       | Passes                  | Zero warnings and zero errors.                                  |
| `pnpm test`            | Passes                  | 223 tests pass across workspace packages and apps.              |
| `pnpm format:check`    | Passes                  | All package files are formatted.                                |
| `pnpm db:generate`     | Passes                  | Drizzle reports 14 tables and no schema changes.                |
| `npx fallow dupes`     | Reports duplication     | 971 duplicated lines, 3.2 percent, 22 clone groups, 3 families. |
| `npx fallow health`    | Fails threshold         | Health score `77 B`; main deductions from hotspots/unit size.   |
| `npx fallow dead-code` | Reports warnings/errors | Unused exports plus one unlisted dependency warning.            |

Known dirty/untracked files at plan creation:

- `apps/docs/api-reference/openapi.json` is modified by the completed public contract slice.
- Several unrelated untracked files exist under infra/experiment/cloudflare planning paths.

## Architecture Rules

Carry forward the rules from the completed architecture plan.

- Keep **Mailbox** as the unit of work.
- Keep **Canonical Mailbox State** durability ahead of **Cursor** advancement.
- Keep **Mailbox Event** creation tied to durable state writes.
- Keep **Webhook Delivery** scheduling driven from durable **Mailbox Event** rows.
- Keep Gmail-specific behavior in `@mailmon/gmail`.
- Keep `@mailmon/core` free of Hono, Pub/Sub, Cloud Tasks, BullMQ, Drizzle, Postgres, and
  transport details.
- Do not add a service **seam** when there is only one **adapter** and no testing leverage.
- Internal **seams** are allowed inside a deep **Module** when they improve locality without
  widening the package interface.
- For Effect code, consult `effect-solutions` before introducing new Effect patterns.

## Current Remaining Friction

### DB mapper Module is too broad

`packages/db/src/persistence/mappers.ts` is now the largest DB persistence file. It owns:

- public resource row mapping.
- cursor encoding and decoding.
- Canonical Message and Thread insert/update mapping.
- Mailbox Event identity construction.
- Webhook Delivery recovery schedule mapping.
- Mailbox operational transition update mapping.

This file has become a grab-bag implementation dependency for many adapters. The deletion test
says some mapping Modules should exist, but not one shared Module with this much interface.

### Gmail package entry point remains overloaded

`packages/gmail/src/index.ts` still owns:

- public Gmail service seams.
- AES-GCM refresh-token encryption.
- provider layer factories.
- Gmail-to-Canonical Mailbox State projection.
- Initial Sync and Incremental Sync assembly.
- stub sync provider behavior.

The Gmail HTTP adapter extraction helped, but this file still mixes unrelated knowledge behind
one implementation body.

### Core use-case Module still owns several workflows

`packages/core/src/use-cases.ts` remains the top hotspot. Some workflows already moved out, but
the file still owns:

- Webhook Delivery response/failure classification and retry completion.
- Replay dispatch.
- watch renewal orchestration and catch-up dispatch.
- mailbox repair and stuck execution recovery orchestration.
- control job routing.

The public use-case exports are useful, but the implementation locality is still weak.

### Public HTTP route declarations are still shallow

`apps/api/src/server.ts` no longer owns manual response schemas, but `createApp(...)` is still a
large route declaration function where every route repeats:

- auth extraction.
- request validation.
- Effect runtime execution.
- Problem Envelope mapping.
- response status mapping.
- OpenAPI route metadata.

The Hono adapter should remain visible, but route declarations need a deeper local interface.

### OpenAPI normalization still encodes product-specific compatibility

`apps/api/src/generate-openapi.ts` still post-processes generated OpenAPI to prefer camelCase
schemas, remove snake_case aliases, normalize `limit`, and force mailbox query requiredness.
That is public contract policy, but it is hidden in a generator implementation.

### Test harness Modules expose more than callers need

`apps/api/src/test-harness.ts` and several test files still appear in duplication/dead export
signals. Some helpers pass the deletion test, but unused exports show their interfaces are
larger than their callers require.

### Mailbox observability query is dense

`packages/db/src/persistence/mailbox-observability-catalog.ts` has a high-complexity
`getMailboxObservability(...)` implementation. The external **seam** is appropriate; the
internal read model construction has poor locality.

### Worker internal auth is still dense

`apps/worker/src/server.ts` still owns Google OIDC verification, local-mode bypass, service
account allow-list matching, and Problem response construction in one function. This is
adapter-local policy, but it deserves its own internal Module.

## Execution Order

Work in small slices. Each slice should leave the repo buildable and testable.

Recommended order:

1. Fallow baseline cleanup.
2. DB persistence mapper partition.
3. Gmail package internal ownership.
4. Webhook Delivery execution Module.
5. Core workflow partition for watch, repair, replay, and control jobs.
6. Public route declaration Module.
7. Public contract generation policy Module.
8. Test harness surface trim.
9. Mailbox observability read-model Module.
10. Worker internal auth Module.

Rationale:

- Start with tool noise so later health/dead-code signals are meaningful.
- Partition DB mappers before more Canonical Mailbox State work.
- Deepen Gmail internals before future provider behavior changes.
- Extract Webhook Delivery execution before broader core use-case partitioning.
- Leave route-spec and OpenAPI work after core contract generation is already stable.
- Trim test harnesses once new Modules create clearer test surfaces.

---

## Slice 0: Fallow Baseline Cleanup

### Files

- `apps/api/src/test-harness.ts`
- `apps/api/src/http/validation.ts`
- `apps/worker/src/internal-route-interpreter.ts`
- `packages/db/src/persistence/mappers.ts`
- `packages/gmail/src/problems.ts`
- package manifests as needed for `@effect/vitest`
- `.fallowrc.jsonc` only if a warning is intentionally accepted

### Problem

Build, lint, typecheck, tests, formatting, and DB generation are clean, but `fallow` no longer has
a clean signal:

- unused exports in DB mappers and API test harness.
- unused type exports in worker interpreter and DB barrel.
- one unlisted dependency warning for `@effect/vitest`.
- health still fails threshold.

Some dead-export findings are expected for package entry points, but most are likely oversized
interfaces.

### Target Shape

- Remove unused exports that are not part of package public interfaces.
- Make helper functions private when only used inside one Module.
- Add package-local dev dependency metadata if `fallow` requires it for test imports.
- Suppress only deliberate package-interface exports, with narrow comments.

### Steps

1. Run `npx fallow dead-code --format json` and classify each finding.
2. For DB mappers, make internal helpers private before the mapper partition in Slice 1.
3. For API test harness, delete fixture exports not used by callers.
4. For worker internal route interpreter, make helper types private unless tests import them.
5. Decide whether `@effect/vitest` should be listed in package manifests or ignored centrally.
6. Re-run `npx fallow dead-code` and record remaining intentional findings.

### Acceptance Criteria

- `npx fallow dead-code` has no accidental unused exports.
- Remaining warnings are either fixed or narrowly justified.
- No product behavior changes.

### Verification

```bash
npx fallow dead-code
pnpm lint
pnpm typecheck
pnpm test
```

---

## Slice 1: DB Persistence Mapper Partition

### Files

- `packages/db/src/persistence/mappers.ts`
- new internal files under `packages/db/src/persistence/`
- DB adapter files importing mapper helpers
- DB tests

### Problem

`mappers.ts` has become a broad implementation dependency. The current interface includes many
unrelated facts a caller must learn: resource row shapes, cursor invariants, stable ID generation,
Canonical Mailbox State comparison, Webhook Delivery recovery timing, and Last Error persistence.

The deletion test says mapper Modules should remain, because deleting them would spread row
mapping and invariant logic across adapters. The current Module is shallow because every adapter
sees the whole bag.

### Target Shape

Split `mappers.ts` by domain ownership:

- `persistence/public-resource-mappers.ts`
  - Mailbox, Message, Thread, Replay, Webhook Endpoint, Subscription, and Sync Run resources.
- `persistence/pagination-cursors.ts`
  - message/thread/sync-run cursor encoding and decoding.
- `persistence/canonical-state-mappers.ts`
  - Canonical Message/Thread insert/update sets, comparison helpers, label normalization.
- `persistence/mailbox-event-mappers.ts`
  - stable Mailbox Event ID creation and Mailbox Event insert mapping.
- `persistence/webhook-delivery-mappers.ts`
  - Prepared Webhook Delivery and recovery schedule mapping.
- `persistence/operational-state-mappers.ts`
  - Mailbox operational transition to DB update mapping.
- `persistence/common-mappers.ts`
  - tiny shared timestamp helpers only if they truly need sharing.

Do not add new service seams. These are internal implementation Modules.

### Steps

1. Move pagination cursor helpers first and update read model adapters.
2. Move public resource row mappers and update catalog adapters.
3. Move Canonical Mailbox State mappers used by `mailbox-sync-commit.ts`.
4. Move Mailbox Event ID and insert mapping used by commit and delivery scheduling.
5. Move Webhook Delivery mappers used by delivery and recovery adapters.
6. Move operational transition update mapping used by sync/watch/repair/credential adapters.
7. Delete the old `mappers.ts` or leave it as a short internal barrel only if imports would churn
   too broadly.

### Acceptance Criteria

- No new external package exports.
- Adapter files import only the mapper Modules relevant to their work.
- `fallow dead-code` unused exports in DB mappers disappear or become narrow intentional exports.
- Canonical Mailbox State commit tests still cover Cursor safety and Mailbox Event identity.

### Verification

```bash
pnpm --filter @mailmon/db test
pnpm --filter @mailmon/db typecheck
npx fallow dead-code
npx fallow health
pnpm db:generate
```

---

## Slice 2: Gmail Package Internal Ownership

### Files

- `packages/gmail/src/index.ts`
- possible new files:
  - `packages/gmail/src/refresh-token-cipher.ts`
  - `packages/gmail/src/canonical-projection.ts`
  - `packages/gmail/src/sync-workflows.ts`
  - `packages/gmail/src/connect-workflows.ts`
  - `packages/gmail/src/watch-workflows.ts`
  - `packages/gmail/src/stub-sync-provider.ts`
- `packages/gmail/src/index.test.ts`

### Problem

`index.ts` remains too broad. It mixes public service seams, encryption, provider layer assembly,
Gmail-to-canonical projection, and stub provider behavior. The package interface should stay
stable, but the implementation needs better locality.

### Target Shape

Keep public exports stable from `packages/gmail/src/index.ts`, but move implementation ownership:

- Refresh token cipher Module owns envelope parsing, key ring creation, encryption, decryption,
  inspection, and rewrap.
- Canonical projection Module owns Gmail Message to Canonical Message/Thread conversion and
  Initial Sync merge rules.
- Sync workflow Module owns Initial Sync and Incremental Sync assembly over the HTTP Gmail API.
- Watch workflow Module owns credential lookup plus watch renewal execution.
- Connect workflow Module owns authorization URL creation and authorization completion.
- Stub provider Module owns deterministic local sync behavior.

No new `Context.Service` should be introduced unless a second adapter or test adapter needs the
seam.

### Steps

1. Move refresh-token cipher implementation first; keep `GmailRefreshTokenCipher` export stable.
2. Add focused tests for plaintext fallback, key rotation, unknown key ID, invalid envelopes, and
   rewrap no-op behavior if existing coverage is not direct enough after the move.
3. Move Gmail-to-canonical projection helpers into a pure Module.
4. Move Initial Sync and Incremental Sync assembly into a Gmail sync workflow Module.
5. Move connect and watch provider layer internals into workflow Modules.
6. Move stub sync provider behavior into its own Module.
7. Leave `index.ts` as public seam declarations plus re-exports/layer factory forwarding.

### Acceptance Criteria

- Public imports from `@mailmon/gmail` remain stable.
- Gmail tests keep covering revoked refresh tokens, rate limits, invalid history cursors, history
  compaction, deleted-before-fetch messages, watch renewal, and connect completion.
- `packages/gmail/src/index.ts` becomes a shallow public entry file, not a mixed implementation
  owner.
- `fallow health` no longer reports `packages/gmail/src/index.ts` as a meaningful hotspot.

### Verification

```bash
pnpm --filter @mailmon/gmail test
pnpm --filter @mailmon/gmail typecheck
pnpm --filter @mailmon/gmail build
npx fallow health
```

---

## Slice 3: Webhook Delivery Execution Module

### Files

- `packages/core/src/use-cases.ts`
- possible new `packages/core/src/webhook-delivery-execution.ts`
- `packages/core/src/webhook-delivery-request.ts`
- `packages/core/src/use-cases.test.ts`
- `apps/worker/src/runtime.ts`
- `apps/cli/src/app.ts`

### Problem

Webhook Delivery request building is now deep, but delivery execution policy still lives inside
`use-cases.ts`:

- endpoint response classification.
- transport failure classification result handling.
- retry delay policy.
- retry exhaustion wording.
- completion request construction.
- finalization and retry scheduling.

This is a coherent workflow and deserves a named Module. The current placement weakens locality
for future delivery retry or endpoint-health changes.

### Target Shape

Create a core Webhook Delivery execution Module that owns delivery attempt classification and
completion construction. Keep transport sending behind the existing `WebhookDeliverySender` seam.

The Module should own:

- response status to delivery completion.
- transport failure to delivery completion.
- retry delay and max attempt policy.
- retry exhaustion wording.
- retry rescheduling after successful compare-and-swap completion.

The existing `runWebhookDelivery(deliveryId)` export may remain as a forwarding export from
`use-cases.ts` during migration.

### Steps

1. Move pure response/failure classification into a new Module with direct unit tests.
2. Move completion finalization and retry scheduling into the same Module.
3. Keep `WebhookDeliveryStore`, `WebhookDeliverySender`, and `WebhookDeliveryScheduler` as the
   existing external service seams.
4. Rewire `runWebhookDelivery` to delegate to the new Module.
5. Trim duplicated test setup in Webhook Delivery use-case tests if the new Module exposes a
   better test surface.

### Acceptance Criteria

- Delivered, retryable 5xx, retry exhaustion, non-retryable 4xx, timeout retry, stale completion,
  and scheduling failure behavior remain unchanged.
- Webhook Delivery execution policy is testable without scanning the full use-case Module.
- `packages/core/src/use-cases.ts` loses delivery classification complexity.

### Verification

```bash
pnpm --filter @mailmon/core test
pnpm --filter @mailmon/worker test -- src/runtime.test.ts
pnpm --filter @mailmon.dev/cli test -- src/app.test.ts
pnpm typecheck
npx fallow health
```

---

## Slice 4: Core Workflow Partition

### Files

- `packages/core/src/use-cases.ts`
- possible new files:
  - `packages/core/src/mailbox-watch-renewal.ts`
  - `packages/core/src/mailbox-repair.ts`
  - `packages/core/src/mailbox-execution-recovery.ts`
  - `packages/core/src/replay-dispatch.ts`
  - `packages/core/src/control-jobs.ts`
- `packages/core/src/use-cases.test.ts`

### Problem

`use-cases.ts` remains the top hotspot. It currently acts as both public use-case index and
workflow implementation owner. That makes unrelated Mailbox behavior hard to navigate.

### Target Shape

Keep public use-case exports stable, but move workflow implementations into named Modules:

- Mailbox watch renewal Module.
- Mailbox repair Module.
- stuck Mailbox execution recovery Module.
- Replay dispatch Module.
- control job routing Module.

Each extracted Module should keep the existing service seams. Do not create new service seams just
to split the file.

### Steps

1. Extract Replay dispatch first because it is mostly independent from Mailbox sync execution.
2. Extract Mailbox repair and stuck execution recovery next.
3. Extract Mailbox watch renewal last because it touches watch state, history Cursor comparison,
   and catch-up sync dispatch.
4. Move control job routing once its target workflows live in named Modules.
5. Leave `use-cases.ts` as public workflow exports plus small cross-workflow helpers only where
   they are truly shared.

### Acceptance Criteria

- Public imports from `@mailmon/core` remain stable.
- Core workflow tests still express Workspace, Mailbox, Replay, and Webhook Delivery behavior.
- `use-cases.ts` is no longer the top hotspot by a wide margin.
- No transport details enter core.

### Verification

```bash
pnpm --filter @mailmon/core test
pnpm --filter @mailmon/core typecheck
pnpm test
npx fallow health
```

---

## Slice 5: Public Route Declaration Module

### Files

- `apps/api/src/server.ts`
- possible new files:
  - `apps/api/src/http/route-specs.ts`
  - `apps/api/src/http/route-runtime.ts`
  - `apps/api/src/http/openapi-responses.ts`
- `apps/api/src/server.test.ts`
- `apps/api/src/public-contract.test.ts`

### Problem

`createApp(...)` repeats public HTTP adapter control flow across routes. The public response
schemas now live in core, but route declarations remain a shallow interface for adding or
changing routes.

### Target Shape

Create an API-local route declaration Module that accepts route-specific data:

- method and path.
- OpenAPI summary, operation ID, parameters, and responses.
- validator.
- auth requirement.
- Effect workflow runner.
- success status.
- response mapping.

Keep Hono as the public HTTP adapter. Do not move Hono details into core.

### Steps

1. Extract shared auth + `runProblemEffect` + Problem Envelope response handling into an
   API-local route runtime helper.
2. Convert one low-risk read route first, such as `GET /v1/mailboxes/:mailboxId`.
3. Convert list routes with query validation next.
4. Convert create routes with body validation next.
5. Keep OAuth redirect routes explicit in `server.ts`; they are different enough to remain local.
6. Keep `/health` and `/openapi.json` explicit.

### Acceptance Criteria

- Public route behavior and response statuses remain unchanged.
- OpenAPI generation remains stable against the checked-in docs artifact.
- `createApp(...)` becomes route registration plus exceptional routes, not every route body.
- Adding a new CRUD-style public route requires less repeated control flow.

### Verification

```bash
pnpm --filter @mailmon/api test
pnpm --filter @mailmon/api typecheck
pnpm --filter @mailmon/api openapi:generate
pnpm format:check
```

---

## Slice 6: Public Contract Generation Policy Module

### Files

- `apps/api/src/generate-openapi.ts`
- possible new `apps/api/src/http/openapi-normalization.ts`
- `apps/api/src/public-contract.test.ts`
- `apps/docs/api-reference/openapi.json`

### Problem

OpenAPI generation still hides public compatibility policy inside generator traversal:

- prefer camelCase request schemas.
- remove snake_case query aliases from public docs.
- normalize `limit` as integer with min/max.
- mark `mailboxId` query parameters as required on list routes.
- lift `$defs` into OpenAPI components.

These are not generic generator details; they are public contract policy.

### Target Shape

Move OpenAPI normalization into a named API-local Module with focused tests. Keep the CLI-style
generator wrapper in `generate-openapi.ts`.

### Steps

1. Extract normalization helpers into `http/openapi-normalization.ts`.
2. Add direct tests with small synthetic OpenAPI fragments for each policy.
3. Keep the existing generated-document equality test.
4. Re-run OpenAPI generation and review whether schema shape drift is intentional.

### Acceptance Criteria

- Public contract post-processing has its own test surface.
- `generate-openapi.ts` becomes orchestration: create app, generate specs, normalize, write file.
- `apps/docs/api-reference/openapi.json` remains deterministic.

### Verification

```bash
pnpm --filter @mailmon/api test -- src/public-contract.test.ts
pnpm --filter @mailmon/api openapi:generate
pnpm --filter @mailmon/api typecheck
```

---

## Slice 7: Test Harness Surface Trim

### Files

- `apps/api/src/test-harness.ts`
- `apps/api/src/server.test.ts`
- `apps/api/src/sandbox-e2e.test.ts`
- `apps/worker/src/server.test.ts`
- `packages/core/src/use-cases.test.ts`
- `packages/gmail/src/index.test.ts`
- DB integration tests where clone groups remain

### Problem

Test harness extraction reduced duplication from 7.1 percent to 3.2 percent, but remaining
signals show test helper interfaces are wider than needed and some clone families remain:

- worker server tests repeat internal HTTP setup.
- core use-case tests repeat Webhook Delivery and Mailbox workflow setup.
- Gmail tests repeat history/fetch scenarios.
- API test harness exports unused fixtures.

### Target Shape

Keep package-local harnesses, but make their interfaces behavior-centered and minimal.

Do not create a global `@mailmon/test` package unless two packages need the same helper
interface after the current slices.

### Steps

1. Remove unused API harness exports.
2. Extract worker internal HTTP scenario helpers only where clone families repeat current route
   setup.
3. Extract Gmail history scenario helpers after Gmail workflow Modules exist.
4. Extract core Webhook Delivery test setup after the Webhook Delivery execution Module exists.
5. Re-run duplication and dead-code checks.

### Acceptance Criteria

- Test names stay behavior-focused.
- Harness interfaces shrink; tests do not need to know unrelated runtime/layer details.
- `npx fallow dupes` stays below 3.2 percent and ideally below 2.5 percent.
- `npx fallow dead-code` no longer reports unused test harness exports.

### Verification

```bash
pnpm test
npx fallow dupes
npx fallow dead-code
```

---

## Slice 8: Mailbox Observability Read-model Module

### Files

- `packages/db/src/persistence/mailbox-observability-catalog.ts`
- possible new internal files:
  - `packages/db/src/persistence/mailbox-observability-read-model.ts`
  - `packages/db/src/persistence/mailbox-observability-queries.ts`
- `packages/db/src/read-model.test.ts`

### Problem

The external `MailboxObservabilityCatalog` seam is useful, but the adapter implementation mixes:

- latest Sync Run reads.
- completed Sync Run cursor movement.
- 24h lease contention/loss windows.
- Webhook Endpoint degradation rows.
- pending/processing/failed Webhook Delivery aggregation.
- final snapshot construction.

The Module is becoming a shallow read-model adapter where one function knows every query detail.

### Target Shape

Keep `MailboxObservabilityCatalog` as the external seam. Split internal read model work into named
functions or Modules:

- mailbox operational row loading.
- sync run inspection loading.
- lease metrics loading.
- webhook delivery degradation loading.
- snapshot assembly.

### Steps

1. Add focused tests if any observability edge case is only covered through a broad fixture.
2. Extract pure snapshot assembly from DB queries.
3. Extract each query group behind a small private helper.
4. Keep all helpers DB-internal; do not widen `@mailmon/db` exports.

### Acceptance Criteria

- Workspace ownership and missing Mailbox behavior remain unchanged.
- Observability snapshot shape remains unchanged.
- The adapter reads like a coordinator over named read-model pieces.

### Verification

```bash
pnpm --filter @mailmon/db test -- src/read-model.test.ts
pnpm --filter @mailmon/db typecheck
npx fallow health
```

---

## Slice 9: Worker Internal Auth Module

### Files

- `apps/worker/src/server.ts`
- possible new `apps/worker/src/internal-auth.ts`
- `apps/worker/src/server.test.ts`

### Problem

Worker internal auth remains embedded in `server.ts`. It combines local-mode bypass, bearer token
parsing, Google OIDC verification, audience/issuer checks, service account allow-list checks, and
Problem response construction.

This is adapter-local policy and should not move to core, but it deserves its own Module.

### Target Shape

Create a worker-local internal auth Module that owns:

- bearer token extraction.
- Google OIDC token verification wrapper.
- trusted issuer and audience checks.
- service account allow-list checks.
- auth failure response bodies/statuses.

Keep route registration in `server.ts`.

### Steps

1. Move pure bearer token and audience/email helpers first.
2. Move `authorizeInternalRequest(...)` and related types into the new Module.
3. Keep `createGoogleOidcVerifier(...)` worker-local.
4. Update server tests to import only behavior-level helpers if needed.

### Acceptance Criteria

- Local mode still bypasses internal auth.
- Non-local mode still requires configured internal auth.
- Missing, invalid, untrusted, and unauthorized tokens keep the same status/body behavior.
- `server.ts` becomes easier to scan around route registration.

### Verification

```bash
pnpm --filter @mailmon/worker test -- src/server.test.ts
pnpm --filter @mailmon/worker typecheck
npx fallow health
```

---

## Cross-Slice Verification

Run after the follow-up refactor set:

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

- `fallow dead-code` has no accidental unused exports.
- Duplication stays below 3.2 percent.
- `packages/db/src/persistence/mappers.ts` is deleted or becomes a small internal barrel.
- `packages/gmail/src/index.ts` becomes a stable public entry file.
- `packages/core/src/use-cases.ts` loses Webhook Delivery, Replay, repair, recovery, watch, and
  control job implementation bulk.
- `apps/api/src/server.ts` route declarations become less repetitive.
- `apps/api/src/generate-openapi.ts` becomes generator orchestration, not policy traversal.
- `packages/db/src/persistence/mailbox-observability-catalog.ts` and `apps/worker/src/server.ts`
  lose their current high-complexity internal functions.

## Stop Conditions

Pause and reassess if any slice requires:

- changing public HTTP resource shapes.
- moving Hono, Pub/Sub, Cloud Tasks, BullMQ, Drizzle, or Postgres details into core.
- weakening Cursor safety or commit transaction ordering.
- scheduling Webhook Delivery from inline sync network calls.
- splitting a real service seam into a hypothetical seam with only one adapter and no testing
  leverage.
- creating a global test package for one-package convenience.
- changing Gmail behavior outside `@mailmon/gmail`.
- reintroducing Effect v3 APIs or unverified Effect patterns.

## Open Questions

1. Should `packages/db/src/persistence.ts` remain a permanent compatibility barrel, or should
   package consumers eventually import narrower public exports?
2. Should public HTTP request schemas also move into `@mailmon/core`, or should core only own
   response/resource contracts while Hono owns transport-shaped requests?
3. Should Webhook Delivery execution policy become a public core workflow export, or stay
   re-exported through `use-cases.ts`?
4. Should test harness extraction stop at package-local helpers, or is a small shared harness
   package justified after the remaining slices?
5. Should OpenAPI normalization be treated as public contract policy with its own ADR once
   request alias compatibility is better understood?
