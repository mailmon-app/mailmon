# Mailmon v1 Launch Readiness

> This document defines the product and launch bar for Mailmon v1.
> It complements `docs/PRD.md` and `plans/mailmon-gmail-sync-infrastructure.md`.
> The PRD is product truth. The engineering plan is implementation sequencing.
> This document answers a different question: what must feel finished from a developer end-user perspective before launch.

## 1. Purpose

Mailmon should not launch as "a pile of working backend pieces."

From a developer customer perspective, Mailmon only feels real if all of the following are true:

- it is obvious what the product does
- time-to-first-success is short
- the API is predictable and well-documented
- webhook behavior is safe and easy to reason about
- failures are diagnosable
- production use feels trustworthy

The launch bar is therefore not just backend correctness.
It is correctness plus developer experience plus production trust.

## 2. Product Promise At Launch

At launch, Mailmon should be able to make this promise credibly:

> Connect a Gmail Mailbox, keep its Canonical Mailbox State correct over time, and deliver durable Mailbox Events safely to your application.

That promise has three parts:

- correct state
- durable events
- safe developer integration

If any one of those is missing, the launch is incomplete.

## 3. Launch Tiers

This repo should think in three launch bars, not one.

### 3.1 Internal Preview

Goal:

- the team can exercise the full product loop end-to-end
- the runtime model works locally and in a dev environment
- correctness bugs can be found before external users see the product

Bar:

- connect a Mailbox
- run Initial Sync and Incremental Sync
- read messages and threads
- register a Webhook Endpoint and Subscription
- persist Mailbox Events
- deliver webhooks locally
- inspect Sync Runs and Mailbox state when something breaks

### 3.2 Private Beta

Goal:

- a small number of design partners can integrate Mailmon into a real staging or low-risk production workflow

Bar:

- durable webhook delivery works in staging and production topology
- integration docs are good enough without a founder walking every user through the API
- customer-facing auth and credential flows exist
- on-call and support workflows exist
- critical security and token-handling gaps are closed

### 3.3 Public Launch

Goal:

- a new developer can discover Mailmon, evaluate it, integrate it, and operate it without bespoke support

Bar:

- self-serve onboarding
- polished docs
- at least one official SDK
- replay and recovery story is real
- clear versioning and change-management policy
- observability and support quality are strong enough for external trust

## 4. The Developer Journey

Mailmon should be evaluated against the end-to-end developer journey, not just against internal architecture milestones.

### 4.1 Discover And Understand

A new developer should be able to answer these questions in under 5 minutes:

- What is Mailmon?
- Why should I use it instead of talking to Gmail directly?
- What does Mailmon guarantee?
- What does Mailmon not guarantee?
- How does Mailmon handle duplicates, retries, and ordering?

Launch requirements:

- concise homepage or docs landing page
- short "why Mailmon" explanation
- one architecture diagram
- explicit delivery semantics
- explicit state semantics
- explicit failure and replay semantics

### 4.2 Get Credentials

If Mailmon is externally launched, workspace provisioning and API key management cannot remain implicit internal operations.

Launch requirements:

- a customer can obtain a Workspace and API Key through a real flow
- API key creation, revocation, and rotation are supported
- docs explain server-side use of API keys clearly
- the product exposes test and production credentials separately if environments differ

Open product question:

- if there is no customer-facing control plane at launch, the launch must remain private beta with manual onboarding

### 4.3 Connect A Mailbox

The first real success moment is a Mailbox becoming connected and healthy.

Launch requirements:

- Connect Session flow is obvious and documented
- duplicate connection behavior is documented
- reconnect behavior is documented
- users can tell whether a Mailbox is `active`, `reconnect_required`, `initializing`, or unhealthy
- the docs explain what developers should do after the Mailbox is connected

### 4.4 Read Canonical Mailbox State

Developers need confidence that Mailmon gives them the durable state they actually want.

Launch requirements:

- message and thread resources are fully documented
- cursor behavior is explicit and stable
- newest-first ordering is explicit and stable
- the difference between Mailbox state and Mailbox Events is explained
- any intentional v1 scope limits are clear

Important scope decision:

- the PRD currently says Mailmon exposes normalized messages, threads, and labels
- if label resources are not part of v1, narrow the public promise before public launch
- if labels remain in scope, expose a coherent label model and document it clearly

### 4.5 Receive Mailbox Events

Webhook delivery is the core integration surface.
This part must feel extremely polished.

Launch requirements:

- webhook endpoint registration is easy
- subscription semantics are easy to understand
- event payloads are documented field-by-field
- stable event IDs are documented and preserved
- delivery retry behavior is documented
- duplicate delivery expectations are documented
- timeout behavior is documented
- endpoint health behavior is documented
- webhook signature verification is documented and easy to implement

From the user perspective, these questions must be answered clearly:

- Can I receive duplicates?
- Can events arrive late?
- What should I use for idempotency?
- Are events ordered globally, per Mailbox, or not guaranteed?
- How do I retry my own failed processing safely?

### 4.6 Debug And Recover

A polished infrastructure product is not judged by the happy path.
It is judged by how quickly a developer can understand a broken path.

Launch requirements:

- Sync Run history is queryable or inspectable
- Mailbox resources expose Last Error clearly
- webhook delivery attempts are inspectable
- replay exists if replay is part of the launch promise
- docs include a troubleshooting guide
- common failure classes have documented remediation

Examples that must be covered:

- revoked Gmail token
- expired Gmail watch
- invalid history cursor
- repeated `5xx` responses from customer webhook endpoint
- duplicate webhook deliveries
- lagging Mailbox

### 4.7 Operate In Production

A developer should be able to trust Mailmon in a real system, not just a demo.

Launch requirements:

- production-safe secret handling
- staging environment behavior that matches production
- observability for sync and delivery pipelines
- alerting for degradation
- backup and restore story for critical data
- clear support escalation path

## 5. Launch Areas And Exit Criteria

This section defines what "finished and polished" means by area.

### 5.1 API Design

The API should feel deliberate and stable.

Must have:

- one canonical naming convention
- consistent resource shapes
- consistent Problem Envelope structure
- explicit pagination semantics
- explicit auth semantics
- explicit versioning strategy for `v1`
- changelog and deprecation policy before public launch

Should have:

- generated OpenAPI 3.1 source of truth
- SDK-friendly error and pagination patterns

### 5.2 Documentation

The docs should make it possible to integrate without live support.

Must have:

- Quickstart: connect a Mailbox and receive the first webhook
- API reference for every public route
- webhook event reference
- auth guide
- troubleshooting guide
- production guide
- deployment guide for the private beta GCP stack

Should have:

- architecture overview
- migration guide for API changes
- operational best practices
- replay guide
- local development guide

### 5.3 SDKs

For a polished developer product, an SDK is eventually the right move.
It is not mandatory for the earliest internal preview, but it is highly desirable for public launch.

Recommended bar:

- official TypeScript SDK for public launch
- generated from OpenAPI using Fern or an equivalent SDK pipeline
- typed webhook event models
- webhook signature verification helper
- pagination helpers
- typed Problem Envelope handling

Open decision:

- ship TypeScript SDK first
- add other languages only after the TypeScript surface and API spec are stable

### 5.4 Webhook Delivery

This is a launch-critical area that must remain polished and continuously validated.

Must have:

- delivery scheduling starts from durable `mailbox_events`
- local delivery runtime works
- staging and production delivery runtime works
- retries on timeout and `5xx`
- endpoint health state updates correctly
- delivery IDs and event IDs are inspectable
- signature verification story is complete

Should have:

- replay into a destination
- clear delivery-attempt inspection tooling

### 5.5 Replay

Replay is part of the PRD promise.
Replay now has a durable product path in the codebase: workspace-scoped Replay resources, mailbox
ownership checks, time range validation, active overlap conflict handling, deterministic mailbox
event selection, webhook delivery scheduling, and status progression.

Must have if included in external launch messaging:

- [x] create Replay
- [x] inspect Replay status
- [x] deterministic re-delivery with the same `event.id`
- [x] conflict handling for overlapping Replays

If Replay is not launched yet:

- remove it from public launch messaging
- state clearly that Replay is planned, not available

### 5.6 Security And Trust

This area is non-negotiable for staging and production.

Must have:

- Gmail refresh tokens encrypted before persistence
- webhook secrets stored safely
- API key generation and rotation
- least-privilege production IAM
- auditability for critical credential actions
- explicit data retention policy
- clear incident response path

Should have:

- secret rotation workflows
- internal security review
- dependency and container scanning in CI

### 5.7 Runtime Correctness And Recovery

Correctness is the core product value.

Must have:

- Initial Sync correctness
- Incremental Sync correctness
- cursor safety
- single-flight Mailbox execution
- durable event emission
- invalid history cursor repair or full-resync path
- Gmail token revocation handling
- Gmail watch expiration handling

Should have:

- automated repair workflows
- explicit catch-up sync tooling

### 5.8 Observability

Developers and operators both need visibility.

Must have:

- Sync Run logs and metrics
- Mailbox state inspection
- webhook delivery metrics
- alerting on failed syncs and repeated delivery failures
- traceability from Mailbox to Sync Run to Mailbox Event to Webhook Delivery

Should have:

- dashboards for sync lag and delivery failure rates
- per-workspace support diagnostics

### 5.9 Local Development Experience

Mailmon should be easy to test before production.

Must have:

- documented local setup
- a real local webhook forwarding workflow
- deterministic local testing for webhook signatures
- a sample receiver or example app

Should have:

- one-command local demo flow
- replay into localhost

### 5.10 Staging And Release Operations

Must have:

- Terraform-managed infrastructure
- environment separation for dev, staging, and prod
- CI/CD pipeline with rollback path
- mailbox sync dispatch dead-letter handling
- webhook delivery retry-exhaustion handling
- migration workflow for database changes
- backup and restore process

Should have:

- pre-release checklist
- canary or staged rollout procedure

## 6. Current Gap Assessment

This section translates the current repo state into launch language.

Current reassessment as of 2026-05-09:

- Internal preview: 90-95% ready
- Private beta: 70-75% ready
- Public launch: 50-55% ready

The backend product core is now strong enough to support real design-partner use.
The remaining public-launch work is mostly launch polish: self-serve onboarding, API contract
stability, docs accuracy, SDK ergonomics, security posture, support operations, and repeatable
release validation.

### 6.1 Already Strong

- Gmail connect flow
- Mailbox creation
- Initial Sync and Incremental Sync
- mailbox lease and cursor safety
- canonical message and thread reads
- webhook endpoint and subscription registration
- durable Mailbox Event emission with stable IDs
- mailbox `lagging` degradation for Gmail `429` and quota-style `403` rate limits
- repair and full-resync flow for invalid or expired Gmail history cursors
- local webhook delivery runtime with retries, endpoint health, and startup recovery of pending/in-flight deliveries
- mailbox observability routes for sync runs and current operational state via `GET /v1/mailboxes/{mailbox_id}/sync-runs` and `GET /v1/mailboxes/{mailbox_id}/observability`
- staging/production retry-exhaustion handling for mailbox sync dispatch and webhook delivery: Pub/Sub dead-letters exhausted mailbox sync dispatches into `/internal/sync-dead-letter`, while exhausted webhook deliveries are persisted as `webhook_delivery_retry_exhausted` and surfaced through structured logs, log-based metrics, and optional Monitoring alerts
- live staging validation of Cloud Tasks-backed webhook delivery, including startup recovery of pending durable deliveries and successful OIDC dispatch to `/internal/webhook-deliveries`
- live staging validation of the Gmail push/watch production path, including Pub/Sub OIDC intake at `/internal/gmail-push`, mailbox sync dispatch to `/internal/sync`, fresh Mailbox Event emission, and customer webhook delivery
- durable Replay resources with create/get API routes, overlap conflict handling, empty-range completion, deterministic Mailbox Event selection, and scheduled re-delivery with stable `event.id` values
- local and CI property-based testing now covers the riskiest backend state machines with Hegel/Vitest: mailbox cursor/lease/commit safety, single-flight sync execution, Gmail history delete-wins behavior, webhook delivery claims and terminal outcomes, Replay overlap/dispatch, worker envelopes, and pagination cursors
- generated OpenAPI output, Fern SDK checks, and a published TypeScript SDK package
- Mintlify docs now include a real introduction, Quickstart, authentication guide, webhook guide, Replay guide, API patterns guide, errors guide, and generated route reference pages
- PRD, README, Mintlify Quickstart/Replay examples, OpenAPI, and the SDK now agree on camelCase Connect Session and Replay field names; Replay creation is consistently `201 Created` with flat `webhookEndpointId`
- v1 Label scope is now explicitly deferred: public state and event payloads expose provider `labelIds`, and no first-class Label API is part of the public route surface

### 6.2 Immediate Launch Blockers

- self-serve Workspace and API key management is still manual/operator-driven
- public docs still contain contract drift in supporting guides: the API patterns guide describes a `meta.hasMore` pagination wrapper while the API returns `object`, `data`, and `nextCursor`; the errors guide describes a top-level `error` object while the API returns the Problem Envelope directly
- public troubleshooting, production docs, and support runbooks are not launch-ready; backup/restore currently exists only as high-level deployment guidance, not a tested operator runbook
- production trust gaps remain: webhook signing secrets are stored as plain database text, deployer IAM is broad, alert policies are optional and disabled by default, and production backup/incident workflows are not yet tested and runbooked

### 6.3 Likely Public-Launch Blockers

- self-serve Workspace and API key management
- public docs accuracy plus API versioning and deprecation policy
- SDK webhook helpers and typed event ergonomics
- polished troubleshooting and production docs
- support workflows, production alert enablement, backup/restore testing, incident response, and operator runbooks
- least-privilege IAM and protected/rotatable webhook secrets

### 6.4 Things That Can Be Deferred Until After Early Beta

- multiple SDK languages
- richer operator console
- advanced analytics
- non-Gmail providers
- AI or semantic features

### 6.5 Verification Evidence

This pass was verified against the codebase on 2026-05-09.

Commands run:

- `pnpm install`
- `pnpm test`
- `pnpm typecheck`
- `pnpm sdk:check`

Results:

- `pnpm test` passed: 17 Turbo tasks, including sandbox E2E coverage for connect flow, sync, durable event emission, webhook delivery, reconnect-required handling, delivery retry behavior, duplicate incremental dispatch idempotency, and newest-first reads.
- `pnpm typecheck` passed with existing warnings only; no type errors.
- `pnpm sdk:check` passed after regenerating `apps/docs/api-reference/openapi.json`.
- API contract tests now pin camelCase Connect Session fields, flat Replay `webhookEndpointId`, `201 Created`, message `labelIds`, and absence of `/v1/labels`.

Items checked off in this pass are limited to things backed by route metadata, tests, generated SDK artifacts, Terraform, or docs that actually exist. Items with only partial implementation remain unchecked.

Additional PBT evidence added on 2026-05-17:

- `docs/testing-requirements.md` now names Hegel, not fast-check, as the repo's executable property-based testing direction.
- Normal package tests include `*.pbt.test.ts` by default through the existing Vitest globs, but the CI coverage lane intentionally excludes PBT with `pnpm test:coverage`.
- The optional `PBT Nightly` workflow runs the PBT-only Vitest config against `@mailmon/core`, `@mailmon/gmail`, and `@mailmon/db` with PostgreSQL, currently using `PBT_TEST_CASES=10` and explicit include groups.
- CI caches `~/.cache/hegel` for Hegel's private `uv` install and does not require Antithesis platform access.

## 7. Recommended Launch Sequence

This is not a replacement for the engineering plan.
It is the recommended product-facing launch sequence.

### 7.1 Phase A: Contract Freeze And Scope Truth

Goal:

- make the public promise match the API, SDK, docs, and PRD exactly

Why this comes first:

- downstream docs, SDKs, examples, tests, and support material will churn until the v1 surface is stable

Required work:

- choose one public JSON naming convention for v1 and apply it consistently across PRD examples, OpenAPI, docs, SDK examples, and API parsers
- settle Connect Session request and response field names
- settle Replay creation shape: either keep the implemented flat `webhookEndpointId` contract or move the API to the PRD `destination` object
- settle Replay create status code: either document `201 Created` everywhere or change the API to `202 Accepted`
- decide Label scope for v1:
  - if Labels are in scope, add a coherent Label resource/read surface and docs
  - if Labels are not in scope, change the PRD and docs to say message `labelIds` are exposed but Label resources are deferred
- document the stable `v1` versioning and deprecation policy
- make `apps/docs/api-reference/openapi.json` the generated source used by docs and SDK checks, with a formatting-stable generation path

Exit criteria:

- PRD examples, generated OpenAPI, TypeScript SDK types, README examples, and Mintlify examples all describe the same API
- every public route has a stable operation, request shape, response shape, problem shape, and status code
- the public promise no longer includes unimplemented Label behavior

### 7.2 Phase B: First-Webhook Developer Journey

Goal:

- a new developer can reach first successful Webhook Delivery in under 30 minutes without founder assistance

Required work:

- replace the current operator-only Workspace and API Key path with either:
  - a minimal self-serve control plane, or
  - a productized private-beta onboarding flow with explicit request/approval/credential delivery steps
- support API Key creation, revocation, rotation, and one-time raw key display
- expose separate Test Key and Live Key behavior if environments differ
- publish a complete Quickstart that starts from no account and ends at a verified Webhook Delivery
- add a copy-paste sample receiver that:
  - receives Mailbox Events
  - verifies webhook signatures
  - deduplicates by Mailbox Event ID
  - returns the right status codes
- add a local webhook testing guide using `mailmon listen` and Replay into localhost
- add screenshots or command transcripts for the happy path from Workspace creation to first event

Exit criteria:

- one fresh developer can complete the documented flow against staging without direct help
- the flow creates or obtains a Workspace, creates an API Key, connects a Mailbox, registers a Webhook Endpoint, creates a Subscription, receives a signed Mailbox Event, verifies the signature, and confirms Canonical Mailbox State through the API
- the docs include an explicit fallback path when Gmail OAuth, webhook delivery, or API auth fails

### 7.3 Phase C: SDK And Webhook Ergonomics

Goal:

- the official TypeScript SDK feels safe to use for the core integration loop

Required work:

- add typed Mailbox Event models for `message.created`, `message.updated`, and `thread.updated`
- add a webhook signature verification helper that matches the actual delivery signing algorithm
- add timestamp tolerance validation and constant-time signature comparison
- add SDK README examples for:
  - Connect Session creation
  - Webhook Endpoint creation
  - Subscription creation
  - message/thread reads
  - Replay creation and status polling
  - webhook signature verification
- add pagination helpers or a documented pagination pattern over `nextCursor`
- expose typed Problem Envelope handling or document how SDK errors map to Problem Envelopes
- add SDK tests for the webhook helper and error ergonomics

Exit criteria:

- the docs no longer mention SDK APIs that do not exist
- a user can implement the documented Quickstart with the SDK without dropping to raw `fetch`
- webhook signature verification has unit tests and at least one framework-neutral example

### 7.4 Phase D: Production Trust And Security

Goal:

- production use feels trustworthy to a security-conscious beta customer

Required work:

- protect webhook signing secrets at rest:
  - encrypt before persistence, or
  - store only a KMS/Secret Manager reference with controlled retrieval
- add webhook secret rotation:
  - create new secret
  - overlap old and new verification windows
  - retire old secret
  - audit rotations
- replace broad deployer IAM with least-privilege roles for Cloud Run, Artifact Registry, Secret Manager, Cloud SQL, Pub/Sub, Cloud Tasks, Cloud Scheduler, Logging, Monitoring, and resource-level IAM updates
- make operational alerts enabled by default for production
- add dependency and container scanning in CI or document the equivalent release gate
- document data retention for mailbox state, Mailbox Events, Webhook Deliveries, Sync Runs, Replays, and logs
- document credential access auditability for API Keys, Gmail refresh tokens, and webhook signing secrets

Exit criteria:

- no launch-critical secret is stored as plaintext application data
- production IAM avoids project-wide `roles/editor` and project IAM admin except for a tightly scoped bootstrap path
- production alerting is on by default or blocked by an explicit launch decision
- a security reviewer can trace API Key, Gmail credential, and webhook secret lifecycles end to end

### 7.5 Phase E: Observability, Support, And Recovery

Goal:

- a customer or operator can diagnose common failures without reading source code

Required work:

- publish troubleshooting docs for:
  - revoked Gmail token
  - expired Gmail watch
  - invalid Gmail history cursor
  - lagging Mailbox
  - duplicate Webhook Deliveries
  - customer endpoint `5xx`
  - customer endpoint `4xx`
  - Replay conflict
  - API authentication failure
- publish an operator runbook for:
  - reading Mailbox observability
  - reading recent Sync Runs
  - finding retry-exhausted Webhook Deliveries
  - replaying a time range
  - recovering stuck syncs
  - handling dead-lettered mailbox dispatch
  - rotating Gmail credential encryption keys
- add or document dashboards for:
  - sync lag
  - failed Sync Runs
  - reconnect-required Mailboxes
  - Webhook Delivery failure rate
  - retry-exhausted deliveries
  - Cloud Tasks backlog
  - Pub/Sub dead letters
- add backup and restore procedure for Cloud SQL and critical secrets
- define support severity levels, escalation path, and response expectations

Exit criteria:

- every known failure class in this document has a documented detection signal and remediation path
- an operator can move from Workspace/Mailbox ID to relevant Sync Runs, Last Error, Mailbox Events, Webhook Deliveries, and Replay status
- backup restore has been tested at least once in staging

### 7.6 Phase F: Repeatable Staging Validation And Release Readiness

Goal:

- the launch process is repeatable, not a one-time manual proof

Required work:

- convert the staging validation guide into a repeatable checklist with recorded evidence fields
- keep the Cloud Tasks Webhook Delivery path and Gmail push/watch path validated before each beta/public release
- add a pre-release checklist covering:
  - migrations
  - OpenAPI generation
  - SDK generation/checks
  - docs build
  - Terraform validation
  - staging smoke test
  - rollback plan
  - known issues
- define release channels:
  - internal preview
  - private beta
  - public launch
- define canary or staged rollout procedure for production
- publish changelog/deprecation policy before public launch

Exit criteria:

- every release candidate has a recorded pass/fail validation record
- rollback steps are documented and tested for API/worker deploys and database migration failures
- public docs and SDK version match the deployed API version

## 8. Launch Checklist

Use this as the final go/no-go list.

### Product

- [ ] Public promise matches actual shipped scope
- [ ] Mailbox, Message, Thread, Mailbox Event, Replay, and Webhook Endpoint terminology is consistent everywhere
- [ ] Any deferred v1 features are removed from public launch messaging

### API

- [ ] Public routes are stable and documented
- [ ] Problem Envelopes are documented and consistent
- [ ] Pagination semantics are documented and tested
- [ ] API versioning and deprecation policy are published
- [x] PRD, OpenAPI, SDK, README, and docs examples all use the same request/response field names
- [x] Replay creation shape and status code are consistent everywhere
- [x] Label scope is either implemented or explicitly deferred

### Docs

- [x] Quickstart exists
- [x] API reference exists
- [x] webhook guide exists
- [ ] troubleshooting guide exists
- [ ] production guide exists
- [ ] local webhook receiver example exists
- [ ] support escalation path is documented

### SDK

- [x] OpenAPI generation and Fern checks exist
- [x] official TypeScript SDK package exists
- [x] webhook verification helper exists
- [ ] typed Mailbox Event models exist
- [ ] pagination and Problem Envelope ergonomics are documented

### Runtime

- [x] webhook deliveries work locally
- [x] webhook deliveries work in staging with production topology
- [x] endpoint health works
- [x] delivery retries work
- [x] Gmail push/watch production path works in staging
- [x] repair/resync path exists for invalid cursors

### Security

- [x] refresh tokens are encrypted before persistence
- [ ] API keys can be created, revoked, and rotated safely through a customer-facing or productized onboarding flow
- [ ] webhook secrets are protected and rotatable
- [ ] IAM and environment boundaries are production-safe
- [ ] data retention policy is published
- [ ] credential auditability is documented

### Operations

- [x] Sync Run observability exists
- [x] webhook delivery observability exists
- [x] alerting exists
- [x] mailbox sync dispatch dead-letter handling exists
- [x] webhook delivery retry-exhaustion handling exists
- [x] backup and restore plan exists
- [ ] incident response runbook exists
- [ ] staging validation is repeatable and recorded for every release candidate
- [ ] rollback process is documented and tested

### Customer Experience

- [ ] a new developer can reach first webhook delivery in under 30 minutes
- [ ] failure states are diagnosable without contacting support
- [ ] the support path is explicit when self-service fails
- [ ] private-beta onboarding can be completed without manual database edits
- [ ] public launch onboarding is self-serve or explicitly productized

## 9. Usability Bar

The product is usable for private beta when all of the following are true:

- a developer can complete the documented first-webhook flow in staging
- support can provision or approve access without direct database edits
- the webhook integration path includes working signature verification examples
- common broken states have documented diagnosis and recovery steps
- operators have alerts and runbooks for failed syncs, retry-exhausted deliveries, dead letters, and reconnect-required Mailboxes
- API/SDK/docs examples are internally consistent even if the product is still manually onboarded

The product is usable for public launch when all private-beta criteria are true and:

- onboarding is self-serve or deliberately productized
- API Keys can be created, revoked, and rotated through the public product surface
- production IAM and secret handling pass a focused security review
- backup/restore and incident response are documented and tested
- SDK and docs are versioned against the deployed API
- a new developer can evaluate, integrate, and recover from common failures without bespoke support

## 10. Decision Rules

Use these rules to avoid fuzzy launch decisions.

- Do not call the product launched if durable events exist but durable delivery does not.
- Do not call the product production-ready if refresh tokens are not encrypted.
- Do not call the product self-serve if Workspace and API key provisioning are manual back-office steps.
- Do not call the API stable while PRD examples, OpenAPI, SDK examples, and route parsers disagree.
- Do not market Replay until Replay is real.
- Do not market normalized Labels until a coherent Label model is either implemented or explicitly deferred.
- Do not document SDK helpers that are not exported by the released SDK.
- Do not widen public scope beyond what docs, SDKs, and support can explain clearly.

## 11. Summary

Mailmon is now close to a credible private beta, but it is not public-launch ready.
The core system is real: Gmail connectivity, Mailbox creation, Initial Sync, Incremental Sync,
cursor safety, lease recovery, Canonical Mailbox State reads, durable Mailbox Events, Webhook
Delivery, Replay, staging GCP paths, observability routes, CLI tools, OpenAPI generation, and the
TypeScript SDK all exist.

The product becomes launchable when the remaining work shifts from "backend works" to "developer
product is trustworthy":

- the first integration is fast and self-explanatory
- the public contract is stable and consistent everywhere
- the SDK does what the docs say it does
- the production security posture is defensible
- operators can diagnose and recover failures from documented runbooks
- customers do not need a founder to decode failures

That is the launch bar.
