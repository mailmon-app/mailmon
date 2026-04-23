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

This is the main launch-critical area still missing from the current implementation.

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
If the product markets replay, replay must be real at launch.

Must have if included in external launch messaging:

- create Replay
- inspect Replay status
- deterministic re-delivery with the same `event.id`
- conflict handling for overlapping Replays

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
- dead-letter and retry-exhaustion handling
- migration workflow for database changes
- backup and restore process

Should have:

- pre-release checklist
- canary or staged rollout procedure

## 6. Current Gap Assessment

This section translates the current repo state into launch language.

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

### 6.2 Immediate Launch Blockers

- webhook deliveries work in staging and production
- Gmail push/watch production path

### 6.3 Likely Public-Launch Blockers

- Replay if it remains part of the external promise
- self-serve Workspace and API key management
- official OpenAPI source of truth
- official SDK
- polished troubleshooting and production docs
- support workflows, alerting, and operator runbooks

### 6.4 Things That Can Be Deferred Until After Early Beta

- multiple SDK languages
- richer operator console
- advanced analytics
- non-Gmail providers
- AI or semantic features

## 7. Recommended Launch Sequence

This is not a replacement for the engineering plan.
It is the recommended product-facing launch sequence.

### 7.1 Bar For Internal Preview

- complete local listen/forward flow
- ship a full quickstart
- validate the full loop end-to-end with the team

### 7.2 Bar For Private Beta

- complete production delivery runtime
- close critical security gaps
- close Gmail push/watch production gaps
- add enough observability and support runbooks for external users
- publish production integration docs

### 7.3 Bar For Public Launch

- settle v1 scope precisely
- ship OpenAPI as a contract source of truth
- ship TypeScript SDK
- ship Replay if it remains in the public promise
- provide self-serve onboarding or a clearly productized onboarding path

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

### Docs

- [ ] Quickstart exists
- [ ] API reference exists
- [ ] webhook guide exists
- [ ] troubleshooting guide exists
- [ ] production guide exists

### SDK

- [ ] OpenAPI source of truth exists
- [ ] official TypeScript SDK exists
- [ ] webhook verification helper exists

### Runtime

- [x] webhook deliveries work locally
- [ ] webhook deliveries work in staging and production
- [x] endpoint health works
- [x] delivery retries work
- [ ] Gmail push/watch production path works
- [x] repair/resync path exists for invalid cursors

### Security

- [x] refresh tokens are encrypted before persistence
- [ ] API keys can be created and rotated safely
- [ ] webhook secrets are protected and rotatable
- [ ] IAM and environment boundaries are production-safe

### Operations

- [x] Sync Run observability exists
- [x] webhook delivery observability exists
- [ ] alerting exists
- [ ] dead-letter handling exists
- [ ] backup and restore plan exists
- [ ] incident response runbook exists

### Customer Experience

- [ ] a new developer can reach first webhook delivery in under 30 minutes
- [ ] failure states are diagnosable without contacting support
- [ ] the support path is explicit when self-service fails

## 9. Decision Rules

Use these rules to avoid fuzzy launch decisions.

- Do not call the product launched if durable events exist but durable delivery does not.
- Do not call the product production-ready if refresh tokens are not encrypted.
- Do not call the product self-serve if Workspace and API key provisioning are manual back-office steps.
- Do not market Replay until Replay is real.
- Do not widen public scope beyond what docs, SDKs, and support can explain clearly.

## 10. Summary

Mailmon is close to being a real product, but not close enough to launch publicly just because the sync engine is working.

The product will feel finished when:

- the first integration is fast
- the production behavior is trustworthy
- the docs explain the system clearly
- the webhook runtime is real
- the recovery story is real
- the customer does not need a founder to decode failures

That is the launch bar.
