# Plan: Mailmon Gmail Sync Infrastructure

> Source PRD: `docs/PRD.md`

## Architectural decisions

Durable decisions that apply across all phases:

- **Runtime model**: keep Hono as the public HTTP adapter; put mailbox-centric workflows, contracts, and service interfaces in `@mailmon/core`; use local dispatch adapters in local development and GCP-native async execution in staging/production.
- **Deployment model**: GCP-first with Cloud Run for `api` and `worker`, Cloud Run Jobs plus Cloud Scheduler for control tasks, Cloud SQL PostgreSQL, Pub/Sub, Cloud Tasks, Secret Manager, and Cloud KMS.
- **Environment model**:
  - local: `apps/api`, `apps/worker`, and `apps/cli` run on the developer machine; Postgres runs in Docker; mailbox sync triggers, webhook scheduling, and control jobs use local adapters instead of cloud-service emulators
  - staging: first full-fidelity environment with the same service topology as production
  - production: same topology as staging with HA, stricter IAM, stronger alerting, and tighter retry/dead-letter controls
- **Infrastructure ownership**: manage all cloud resources with Terraform; use GitHub Actions for container builds and deployments; keep one GCP project per environment (`dev`, `staging`, `prod`).
- **Auth model**: server-side API uses workspace-scoped API keys in `Authorization: Bearer <mailmon_api_key>`.
- **Sync coordination model**:
  - single-flight is enforced by a database-backed mailbox lease, not by Pub/Sub ordering or worker topology
  - active lease state lives on the `mailboxes` row
  - each sync attempt uses an ephemeral lease owner ID
  - lease recovery uses TTL plus heartbeat
- **Routes**:
  - `POST /v1/mailboxes/connect-sessions`
  - `GET /v1/mailboxes/{mailbox_id}`
  - `POST /v1/webhook-endpoints`
  - `POST /v1/webhook-endpoints/{endpoint_id}/subscriptions`
  - `GET /v1/messages`
  - `GET /v1/messages/{message_id}`
  - `GET /v1/threads`
  - `GET /v1/threads/{thread_id}`
  - `POST /v1/replays`
  - `GET /v1/replays/{replay_id}`
- **Internal runtime interfaces**:
  - `POST /internal/gmail-push`
  - `POST /internal/sync`
  - `POST /internal/webhook-deliveries`
- **Schema**:
  - `mailboxes`
    - includes active sync lease fields for owner, acquisition, heartbeat, expiry, and optional current sync run linkage
  - `messages`
  - `threads`
  - `message_labels`
  - `sync_runs`
  - `mailbox_events`
  - `webhook_deliveries`
  - replay persistence in the database
- **Key models**:
  - mailbox is the unit of work
  - push is wake-up, not truth
  - cursor advancement happens only after durable state writes
  - event delivery is at-least-once with stable event IDs
  - duplicate wake-ups are acceptable; only the current mailbox lease holder may execute sync
- **Messaging model**:
  - Gmail watch notifications arrive through Pub/Sub and only wake the system up
  - mailbox sync execution is mailbox-scoped and transport-neutral at the core boundary
  - webhook delivery uses Cloud Tasks semantics in staging/production and local scheduler adapters in local development
- **Core coordination interfaces**:
  - mailbox sync acquisition, heartbeat, and release are transport-neutral services in `@mailmon/core`
  - sync run outcomes distinguish executed, skipped-due-to-active-lease, failed-after-acquisition, and lease-lost paths
- **Provider boundary**: Gmail-specific behavior stays in `@mailmon/gmail`; no app should call Gmail APIs directly.
- **Error model**: synchronous API failures use problem-details style envelopes; mailbox and delivery degradation are represented on resources.
- **Secrets and token handling**: application secrets live in Secret Manager; Gmail refresh tokens are encrypted with Cloud KMS-backed application logic before persistence.

---

## Phase 1: Mailbox Resource Spine

**User stories**: fetch mailbox status; expose mailbox operational state; return structured 404/problem errors for absent mailboxes.

### What to build

Create the first durable mailbox read path from Postgres through `@mailmon/core` and `apps/api`. The mailbox resource should match the PRD shape closely enough to carry `status`, `sync_state`, `watch_state`, timestamps, and `last_error`, even if most fields are still minimally populated.

### Acceptance criteria

- [x] `mailboxes` exists as a real persistent table and replaces bootstrap-only mailbox fixtures for API reads
- [x] `GET /v1/mailboxes/{mailbox_id}` returns a mailbox resource with the PRD state fields
- [x] Missing mailboxes return the shared problem envelope with `404 Not Found`
- [x] Mailbox operational degradation is represented on the mailbox resource, not as a transport error

---

## Phase 2: Connect Session To Mailbox Creation

**User stories**: create connect session; redirect user to hosted OAuth; create mailbox after successful auth; reject duplicate mailbox connections in the same workspace.

### What to build

Implement the first real write path into the system. Developers create a connect session, the user is redirected into a Mailmon-hosted Gmail OAuth flow, and on success Mailmon creates a mailbox resource and marks it for initial sync.

### Acceptance criteria

- [ ] `POST /v1/mailboxes/connect-sessions` creates a connect session resource with `connect_url` and `expires_at`
- [ ] Mailboxes are created from successful Gmail authorization without manual DB seeding
- [ ] Duplicate mailbox connections in the same workspace return `409 mailbox_already_connected`
- [ ] Mailbox creation records enough identity to uniquely map a Gmail account inside a workspace

---

## Phase 3: Initial Sync Tracer Bullet

**User stories**: initial full sync; sync run tracking; canonical mailbox state bootstrap; mailbox state moves from initializing to healthy.

### What to build

Implement the first narrow but real sync path: one connected mailbox can be scheduled, published through the mailbox dispatch boundary, processed by the worker, read from Gmail, and written into canonical mailbox state with a recorded sync run.

### Acceptance criteria

- [x] A mailbox can transition into `initializing`, be scheduled through the shared mailbox dispatch interface, and complete an initial sync
- [x] The worker acquires a mailbox lease before doing initial sync work
- [x] `sync_runs` records the run lifecycle for the initial sync
- [x] Canonical message/thread baseline data is written durably
- [x] Mailbox state transitions to `healthy` after a successful initial sync
- [x] The initial sync path works with local dispatch adapters in local development and Pub/Sub-backed dispatch in staging/production without changing core workflow code
- [x] Duplicate initial-sync dispatches are safe and become normal skipped attempts when another lease holder is active

---

## Phase 4: Incremental Sync And Cursor Safety

**User stories**: incremental sync via `historyId`; cursor lifecycle management; duplicate notifications; worker crash safety; monotonic cursor behavior.

### What to build

Implement the correctness-critical incremental sync loop. The worker should accept mailbox-scoped wake-ups from the transport boundary, acquire or validate mailbox lease ownership, fetch Gmail history since the stored cursor, apply changes idempotently, and only then commit cursor advancement. Duplicate notifications and retries must be safe.

### Acceptance criteria

- [x] Incremental sync reads Gmail history from the stored mailbox cursor
- [x] Cursor advancement happens only after durable mailbox state writes succeed
- [x] Duplicate notifications do not create duplicate state changes or invalid cursor movement
- [x] Worker retries or crashes do not corrupt mailbox state or lose changes
- [x] One active sync per mailbox is enforced by the mailbox lease, not by queue semantics
- [x] The worker heartbeats the lease during long-running sync execution
- [x] Expired leases can be safely taken over by a new sync attempt
- [x] Losing the lease mid-run stops execution and records the correct sync run outcome
- [x] Gmail push remains a wake-up signal only; a direct sync dispatch path exists for local development without requiring local Pub/Sub

---

## Phase 5: Messages And Threads Read API

**User stories**: list/get messages; list/get threads; expose canonical normalized mailbox state to developers.

### What to build

Expose the first useful developer read surface over the synced canonical state. Developers should be able to query mailbox messages and threads through the API without knowing anything about Gmail history or sync internals.

### Acceptance criteria

- [ ] `GET /v1/messages` returns paginated mailbox-scoped canonical messages
- [ ] `GET /v1/messages/{message_id}` returns a single canonical message
- [ ] `GET /v1/threads` returns paginated mailbox-scoped canonical threads
- [ ] `GET /v1/threads/{thread_id}` returns a thread plus its messages
- [ ] Response shapes match the PRD fields for message/thread resources

---

## Phase 6: Event Log And Webhook Delivery

**User stories**: emit `message.created`, `message.updated`, and `thread.updated`; register webhook endpoints; subscribe mailboxes; deliver at-least-once with stable event IDs.

### What to build

Turn state changes into durable mailbox events and deliver them through registered webhook endpoints. This slice includes endpoint registration, subscriptions, event persistence, delivery attempts, and endpoint health, with Cloud Tasks as the production delivery primitive.

### Acceptance criteria

- [ ] `POST /v1/webhook-endpoints` creates webhook endpoints and returns the secret once
- [ ] `POST /v1/webhook-endpoints/{endpoint_id}/subscriptions` stores mailbox-scoped subscriptions
- [ ] Sync-generated state changes create durable mailbox events with stable IDs
- [ ] Webhook deliveries retry on timeout and `5xx`
- [ ] Endpoint health reflects repeated delivery failures without breaking unrelated API reads
- [ ] Delivery scheduling is transport-neutral in core and can run through local adapters in development and Cloud Tasks in staging/production

---

## Phase 7: Replay Jobs

**User stories**: create replay job; get replay status; allow empty-range replay; reject overlapping replay conflicts; deterministically re-deliver historical events.

### What to build

Use the durable mailbox event log as a replay source. Developers should be able to queue a mailbox-scoped replay for a time range and destination, monitor its status, and receive historical events with the original stable event IDs.

### Acceptance criteria

- [ ] `POST /v1/replays` creates replay jobs scoped by mailbox and time range
- [ ] `GET /v1/replays/{replay_id}` returns replay resource state
- [ ] Empty event ranges still complete successfully with zero replayed events
- [ ] Overlapping active replays for the same mailbox and destination return `409 replay_conflict`
- [ ] Replay re-delivers historical events with the same `event.id` values

---

## Phase 8: Local Dev And Operator Flows

**User stories**: `mailmon listen --forward-to ...`; replay events into localhost; support deterministic local webhook testing without local Gmail Pub/Sub.

### What to build

Complete the developer local-dev story. The CLI should become a real operator tool that can forward deliveries to localhost and replay stored events into a local endpoint, with test signatures and deterministic behavior, without requiring local emulation of Pub/Sub, Cloud Tasks, Secret Manager, or Cloud Scheduler.

### Acceptance criteria

- [ ] `mailmon listen --forward-to <url>` forwards Mailmon deliveries to a local endpoint
- [ ] `mailmon replay --mailbox ... --last ... --forward-to ...` replays stored events into localhost
- [ ] Local testing does not require local Gmail Pub/Sub or watch infrastructure
- [ ] Test signatures are supported for local webhook verification
- [ ] Developers can run control-job behavior manually through CLI or local runtime entrypoints instead of cloud schedulers

---

## Phase 9: Operational Resilience

**User stories**: token refresh and revocation handling; watch expiration; rate-limit-aware scheduling; lag and failure observability; repair syncs.

### What to build

Harden the system for production behavior under failure and scale. This slice focuses on operational state transitions, recovery paths, throttling, observability, and environment-specific operations that make the sync system survivable beyond happy-path demos.

### Acceptance criteria

- [ ] Revoked or unrefreshable Gmail tokens move mailboxes into `reconnect_required`
- [ ] Watch expiration is detected and mailboxes move through `expiring` and `expired` states appropriately
- [ ] Gmail `429` and `403` rate limits degrade mailbox sync state without surfacing as unrelated synchronous API failures
- [ ] Repair or catch-up sync paths exist for missed changes and unhealthy watches
- [ ] Sync runs, cursor movement, mailbox lag, and webhook delivery degradation are observable
- [ ] Stuck mailbox execution recovers through lease expiry and takeover
- [ ] Repeated lease contention or lease loss is observable and alertable
- [ ] Staging and production have explicit dead-letter and retry-exhaustion handling for sync dispatch and webhook delivery
