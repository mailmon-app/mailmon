<!-- effect-solutions:start -->

## Effect Best Practices

**IMPORTANT:** Always consult effect-solutions before writing Effect code.

1. Run `pnpm exec effect-solutions list` to see available guides
2. Run `pnpm exec effect-solutions show <topic>...` for relevant patterns (supports multiple topics)
3. Search `~/.local/share/effect-solutions/effect` for real implementations

Topics: quick-start, project-setup, tsconfig, basics, services-and-layers, data-modeling, error-handling, config, testing, cli.

Never guess at Effect patterns - check the guide first.

## Local Effect Source

The Effect v4 repository is cloned to `~/.local/share/effect-solutions/effect` for reference.
Use this to explore APIs, find usage examples, and understand implementation
details when the documentation isn't enough.

<!-- effect-solutions:end -->

## Codebase Map

Read the planning docs in this order before making product-level decisions:

1. `docs/PRD.md` for product truth
2. `plans/mailmon-gmail-sync-infrastructure.md` for implementation sequencing
3. `UBIQUITOUS_LANGUAGE.md` for canonical domain terms

The repo is organized as:

- `packages/core`: mailbox-centric domain contracts, problem envelopes, Effect service tags, and use cases. This is the business-logic center.
- `packages/db`: Drizzle schema and persistence-side bootstrap layers. `src/bootstrap.ts` is currently a bootstrap/dev adapter, not production persistence.
- `packages/gmail`: Gmail provider adapter layers.
- `packages/queue`: async/runtime adapter package. It now contains local async transport layers and still retains Redis/BullMQ compatibility helpers as transitional scaffolding.
- `packages/config`: shared environment/config layers. It now models async transport mode explicitly (`local`, `gcp`, `legacy_bullmq`) instead of treating Redis as part of common runtime config.
- `apps/api`: thin Hono HTTP adapter. It should decode requests, call core use cases, and map failures to HTTP.
- `apps/worker`: thin async execution adapter. It now defaults to an internal HTTP runtime for `local`/`gcp` modes and only uses BullMQ in the explicit `legacy_bullmq` fallback mode.
- `apps/cli`: Effect CLI for local development and operator flows.

## Architecture Rules

- Mailbox is the unit of work. Prefer `mailboxId` everywhere; do not reintroduce account-scoped queue or workflow names.
- Keep Hono as the public HTTP adapter. Do not put product rules in route handlers or runtime handlers.
- Put cross-process contracts and workflow logic in `@mailmon/core`.
- `@mailmon/core` must not import Hono, Pub/Sub, Cloud Tasks, BullMQ, Drizzle, Postgres, or other transport/infrastructure details.
- `@mailmon/db`, `@mailmon/gmail`, and `@mailmon/queue` should implement or support core interfaces; apps compose them.
- If you add a new API/resource shape, define the shared type/contract in `@mailmon/core` first.
- Structured API problems live in core and should remain problem-details style.
- Production async execution is GCP-first: Pub/Sub for wake-ups and mailbox dispatch, Cloud Tasks for directed webhook delivery, Cloud Run Jobs for scheduled control work.
- Local development should use lightweight local adapters instead of requiring Pub/Sub, Cloud Tasks, or Cloud Scheduler emulation.
- Worker runtime mode is chosen through `MAILMON_ASYNC_TRANSPORT_MODE`; prefer `local` or `gcp`, and treat `legacy_bullmq` as fallback scaffolding only.
- Internal worker HTTP routes (`/health`, `/internal/sync`, `/internal/gmail-push`, `/internal/webhook-deliveries`) are transport/runtime interfaces, not domain logic boundaries.

## Terminology Rules

- Follow `UBIQUITOUS_LANGUAGE.md` strictly.
- Use **Mailbox** instead of account/inbox/Gmail account when referring to the unit of work.
- Use **Push Notification** for inbound wake-up signals and **Mailbox Event** for durable emitted events.
- Use **Problem Envelope** for synchronous API failures and **Last Error** for resource-level degradation.
- Use **Workspace** as the canonical ownership boundary unless the code explicitly introduces a separate domain concept.

## Navigation Hints

Start here when tracing behavior:

- mailbox contracts and workflows: `packages/core/src/contracts.ts`, `packages/core/src/services.ts`, `packages/core/src/use-cases.ts`
- API composition: `apps/api/src/runtime.ts`, `apps/api/src/server.ts`
- worker composition: `apps/worker/src/runtime.ts`, `apps/worker/src/processor.ts`, `apps/worker/src/index.ts`, `apps/worker/src/server.ts`
- local async transport adapters: `packages/queue/src/index.ts`
- DB schema, persistence, and bootstrap adapters: `packages/db/src/schema.ts`, `packages/db/src/persistence.ts`, `packages/db/src/bootstrap.ts`
- runtime config model: `packages/config/src/index.ts`

Current bootstrap note:

- The repo still contains bootstrap/dev scaffolding in `packages/db/src/bootstrap.ts`, but mailbox reads, sync runs, and mailbox lease coordination now have DB-backed implementations in `packages/db/src/persistence.ts`.
- The public read surface now includes workspace-scoped `GET /v1/messages`, `GET /v1/messages/{message_id}`, `GET /v1/threads`, and `GET /v1/threads/{thread_id}` routes backed by canonical `messages` and `threads` state in Postgres.
- `packages/gmail/src/index.ts` now has a real HTTP Gmail sync provider path with persisted refresh-token lookup from `gmail_mailbox_credentials`, durable canonical baseline writes, and Gmail history-based incremental sync from the stored mailbox cursor.
- Mailbox sync state writes are now lease-aware, successful sync finalization is committed transactionally with sync run completion and lease clearing, and the worker heartbeats the mailbox lease across the full sync critical section so stale leases can be taken over safely.
- Duplicate wake-ups now rely on the stored mailbox cursor plus Gmail history compaction, so repeated dispatches do not replay stale mailbox state changes.
- Mailbox creation and hosted Gmail OAuth/connect-session flow are now real: the API authenticates workspace-scoped API keys, persists DB-backed connect sessions, exchanges Gmail OAuth codes for refresh tokens, creates workspace-scoped mailboxes, and dispatches the initial sync automatically.
- Local verification for the connect flow still uses a mock Gmail OAuth/API server rather than live Google credentials.
- `packages/queue` now contains usable local transport adapters, but BullMQ/Redis helpers are still present for compatibility.
- `apps/worker` now defaults to HTTP runtime modes, but the BullMQ path is still present as `legacy_bullmq` scaffolding.
- Treat all of those as scaffolding to replace, not as the final production design.

Current planning note:

- `plans/mailmon-gmail-sync-infrastructure.md` is the active engineering breakdown for the PRD.
- That plan now includes the durable deployment model: GCP-first, Cloud Run services/jobs, Pub/Sub, Cloud Tasks, Cloud SQL, Secret Manager, Cloud KMS, and a local/staging/production environment strategy.
- Do not create separate roadmap/task docs that duplicate the plan; that causes documentation drift.

## Tooling Notes

- This repo uses real Node ESM with `module: "NodeNext"` and package `"type": "module"`.
- Use `.js` extensions in relative TypeScript imports. Do not switch back to extensionless imports.
- Shared dependency versions live in `pnpm-workspace.yaml` catalogs.
- Root scripts are delegators only; package tasks live in package-level `package.json` files.
- When changing infra-facing code, check `packages/config` and the plan together so local adapters and GCP adapters stay aligned.
- If builds appear to use stale workspace types after changing exported config/package interfaces, clear package-level `.tsbuildinfo` caches before assuming the type model is wrong.

Useful commands:

- `pnpm build`
- `pnpm lint`
- `pnpm typecheck`
- `pnpm test`
- `pnpm format:check`
- `pnpm db:generate`

## Effect Guidance For This Repo

- Prefer adding new domain workflows as Effect programs in `@mailmon/core`.
- Prefer layers over ad hoc constructors when wiring shared services.
- If an app needs to do real work, compose a runtime layer in the app and call a core use case.
- Prefer transport-neutral service interfaces in core so the same workflow can run against local adapters and GCP adapters.
- Check `effect-solutions` before introducing a new Effect pattern or abstraction.
