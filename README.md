<h1 align="center">
  Mailmon
</h1>

<p align="center">
  Gmail-first sync infrastructure for correct mailbox state, durable events, and replayable webhooks.
  <br />
  A reliable event system on top of Gmail.
  <br />
  <a href="#about">About</a>
  ·
  <a href="#quickstart">Quickstart</a>
  ·
  <a href="https://github.com/anomalyco/mailmon">GitHub</a>
</p>

## Problem

Most Gmail integrations fail in production because:

- Duplicate push notifications cause replayed state
- Missed changes from bad cursor handling
- Worker crashes between fetch and commit
- Invalid or expired Gmail history cursors
- Revoked OAuth tokens
- Webhook endpoints going down
- No replay path for historical changes

Mailmon treats email sync as a distributed systems problem, not a fetch loop.

The key question is not "can we read email?" — it's:

> Can we maintain correct mailbox state over time under retries, failures, and scale?

## Current status

Mailmon is an active infrastructure project.

**Implemented**

- Connectivity: Gmail OAuth connect sessions and encrypted refresh-token storage
- Sync: initial/incremental sync, Gmail `historyId` cursor handling, and database-backed mailbox leases
- Read API: canonical messages, threads, sync runs, and mailbox observability
- Events: durable mailbox event log, webhook endpoints/subscriptions, retryable delivery, and replay jobs
- Operations: local CLI flows, Gmail credential audit/rewrap commands, internal worker OIDC outside local mode
- Cloud runtime: Pub/Sub-backed sync dispatch, Cloud Tasks-backed webhook delivery, and Terraform GCP infrastructure

**Still in progress**

- Broader cloud-transport integration tests
- Stronger API key metadata such as labels, last-used timestamps, rotation UX, and audit trails

## Core Design Principles

1. **Mailbox is the unit of work.** Each mailbox owns its cursor, operational state, and active sync lease. No account-scoped state.

2. **Push is a wake-up, not truth.** Gmail push notifications trigger work. Gmail history remains the source of truth.

3. **State first, cursor second.** The cursor advances only after mailbox state and events are durably committed.

4. **Correctness over speed.** Durable event logs, transactional state commits, and mailbox leases enforce one sync per mailbox—queue ordering is not trusted.

## At a Glance

| Area            | Current state                                                   |
| --------------- | --------------------------------------------------------------- |
| Provider        | Gmail                                                           |
| Sync model      | Canonical state + durable event log with at-least-once webhooks |
| API             | HTTP with workspace-scoped API keys                             |
| Persistence     | PostgreSQL (Drizzle ORM)                                        |
| Async transport | Pub/Sub (sync dispatch) + Cloud Tasks (webhook delivery)        |
| Local dev       | Full feature parity via local adapters, no emulators required   |

## Quickstart

### Prerequisites

- Node.js 22+
- pnpm 10.32.1
- Docker
- Docker Compose
- Gmail OAuth credentials, if testing real Gmail connectivity

### 1. Install dependencies

```bash
pnpm install
```

### 2. Configure local environment

Create a `.env` file:

```bash
NODE_ENV=development
DATABASE_URL=postgres://mailmon:mailmon@127.0.0.1:5432/mailmon
MAILMON_ASYNC_TRANSPORT_MODE=local
MAILMON_WORKER_BASE_URL=http://127.0.0.1:3001

# Generate your own 32-byte base64 key.
MAILMON_GMAIL_REFRESH_TOKEN_ENCRYPTION_KEY=replace_me
MAILMON_GMAIL_REFRESH_TOKEN_ENCRYPTION_KEY_ID=primary

# Required for real Gmail OAuth.
MAILMON_GMAIL_OAUTH_CLIENT_ID=replace_me
MAILMON_GMAIL_OAUTH_CLIENT_SECRET=replace_me
```

Generate a local encryption key:

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"
```

> [!IMPORTANT]
> The encryption key must be exactly 32 bytes base64-encoded. Generate with:
>
> ```bash
> node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"
> ```

### 3. Start local services

```bash
pnpm docker:up
pnpm db:migrate
pnpm dev
```

Default local URLs:

- API: `http://127.0.0.1:3000`
- Worker: `http://127.0.0.1:3001`

> [!TIP]
> Local mode does not require local Pub/Sub, Cloud Tasks, or Gmail watch infrastructure. It uses local adapters so the core sync and webhook flows can be developed without cloud emulators.

## Operator CLI

Create a workspace:

```bash
pnpm --filter @mailmon/cli dev -- admin workspace create
```

Create an API key:

```bash
pnpm --filter @mailmon/cli dev -- admin keys create --workspace-id <workspace-id>
```

Run a mailbox sync:

```bash
pnpm --filter @mailmon/cli dev -- sync-mailbox <mailbox-id>
```

Run a control job:

```bash
pnpm --filter @mailmon/cli dev -- control-job recover_stuck_syncs
```

Audit or rewrap persisted Gmail credential envelopes:

```bash
pnpm --filter @mailmon/cli dev -- gmail-credentials audit
pnpm --filter @mailmon/cli dev -- gmail-credentials rewrap
```

Forward webhook deliveries to a local app:

```bash
pnpm --filter @mailmon/cli dev -- listen \
  --forward-to http://localhost:4000/webhooks/mailmon
```

Replay stored events into a local endpoint:

```bash
pnpm --filter @mailmon/cli dev -- replay \
  --mailbox <mailbox-id> \
  --last 1h \
  --forward-to http://localhost:4000/webhooks/mailmon
```

## Architecture

Mailmon is built on Effect service interfaces (transport-neutral contracts), PostgreSQL persistence via Drizzle ORM for atomic state commits, and GCP-native async transport: Pub/Sub for mailbox sync dispatch, Cloud Tasks for webhook delivery scheduling. TypeScript, Hono, and Effect power the API and worker runtimes.

**Key guarantee:** Sync runs hold a database-backed lease. Only one sync executes per mailbox. State and events are committed atomically with cursor advancement.

```mermaid
flowchart TD
    App[Developer Application] -->|API key| API[Mailmon API]

    API --> DB[(PostgreSQL)]
    API -->|create connect session| GmailOAuth[Gmail OAuth]
    GmailOAuth --> API

    GmailPush[Gmail Push] --> GmailPubSub[Pub/Sub]
    GmailPubSub --> Worker[Mailmon Worker]

    API -->|sync request| SyncPubSub[Pub/Sub Sync Dispatch]
    SyncPubSub --> Worker

    Worker -->|lease + state + cursor| DB
    Worker -->|fetch history/messages| GmailAPI[Gmail API]
    GmailAPI --> Worker

    Worker -->|durable events| DB
    Worker --> Tasks[Cloud Tasks / Local Scheduler]
    Tasks --> Webhook[Customer Webhook Endpoint]

    Scheduler[Cloud Scheduler] -->|control jobs| Worker
```

## Project structure

```text
.
├── apps/
│   ├── api/        # Public HTTP API
│   ├── worker/     # Sync, Gmail push, webhook delivery, control jobs
│   ├── cli/        # Local dev and operator commands
│   └── docs/       # Mintlify docs app
│
├── packages/
│   ├── core/       # Contracts, use cases, service interfaces
│   ├── db/         # Drizzle schema, persistence adapters, migrations
│   ├── gmail/      # Gmail OAuth, sync provider, watch provider, token crypto
│   ├── queue/      # Local dispatch, Pub/Sub dispatch, Cloud Tasks scheduling
│   └── config/     # Runtime configuration
│
├── infra/          # Terraform-managed GCP infrastructure
├── plans/          # Architecture and implementation plans
└── docker-compose.yml
```

## API examples

All public API examples require a workspace API key:

```bash
export MAILMON_API_KEY=mm_test_...
```

> [!TIP]
> Webhook events include an `id` field. Consumers must deduplicate by event ID—delivery is at-least-once, not exactly-once.

### Create a Gmail connect session

```bash
curl -X POST http://127.0.0.1:3000/v1/mailboxes/connect-sessions \
  -H "authorization: Bearer $MAILMON_API_KEY" \
  -H "content-type: application/json" \
  -d '{
    "provider": "gmail",
    "tenantExternalId": "tenant_demo",
    "mailboxExternalId": "primary",
    "redirectUrl": "http://localhost:3000/connected"
  }'
```

Example response:

```json
{
  "id": "mcs_...",
  "object": "connect_session",
  "connectUrl": "http://127.0.0.1:3000/oauth/gmail/mcs_...",
  "expiresAt": "2026-05-04T10:15:00.000Z"
}
```

Send the user to `connectUrl`. After OAuth succeeds, Mailmon creates the mailbox and dispatches initial sync.

### Get mailbox state

```bash
curl http://127.0.0.1:3000/v1/mailboxes/mbx_... \
  -H "authorization: Bearer $MAILMON_API_KEY"
```

Example response:

```json
{
  "id": "mbx_...",
  "object": "mailbox",
  "provider": "gmail",
  "emailAddress": "user@example.com",
  "status": "active",
  "syncState": "healthy",
  "watchState": "active",
  "initializedAt": "2026-05-04T10:00:00.000Z",
  "lastSuccessfulSyncAt": "2026-05-04T10:01:00.000Z",
  "lastError": null
}
```

### List messages

```bash
curl "http://127.0.0.1:3000/v1/messages?mailboxId=mbx_...&limit=50" \
  -H "authorization: Bearer $MAILMON_API_KEY"
```

### List threads

```bash
curl "http://127.0.0.1:3000/v1/threads?mailboxId=mbx_...&limit=50" \
  -H "authorization: Bearer $MAILMON_API_KEY"
```

### Inspect sync runs

```bash
curl "http://127.0.0.1:3000/v1/mailboxes/mbx_.../sync-runs" \
  -H "authorization: Bearer $MAILMON_API_KEY"
```

### Inspect mailbox observability

```bash
curl "http://127.0.0.1:3000/v1/mailboxes/mbx_.../observability" \
  -H "authorization: Bearer $MAILMON_API_KEY"
```

### Create a webhook endpoint

```bash
curl -X POST http://127.0.0.1:3000/v1/webhook-endpoints \
  -H "authorization: Bearer $MAILMON_API_KEY" \
  -H "content-type: application/json" \
  -d '{
    "url": "https://example.com/webhooks/mailmon",
    "description": "Production mailbox events"
  }'
```

The webhook secret is returned once.

### Subscribe an endpoint to mailbox events

```bash
curl -X POST http://127.0.0.1:3000/v1/webhook-endpoints/whe_.../subscriptions \
  -H "authorization: Bearer $MAILMON_API_KEY" \
  -H "content-type: application/json" \
  -d '{
    "mailboxIds": ["mbx_..."],
    "eventTypes": ["message.created", "message.updated", "thread.updated"]
  }'
```

### Create a replay job

```bash
curl -X POST http://127.0.0.1:3000/v1/replays \
  -H "authorization: Bearer $MAILMON_API_KEY" \
  -H "content-type: application/json" \
  -d '{
    "mailboxId": "mbx_...",
    "webhookEndpointId": "whe_...",
    "startTime": "2026-05-04T09:00:00.000Z",
    "endTime": "2026-05-04T10:00:00.000Z"
  }'
```

### Get replay state

```bash
curl http://127.0.0.1:3000/v1/replays/rpl_... \
  -H "authorization: Bearer $MAILMON_API_KEY"
```

## Webhooks

Mailmon emits:

- `message.created`
- `message.updated`
- `thread.updated`

Example event:

```json
{
  "id": "evt_...",
  "type": "message.created",
  "schemaVersion": 1,
  "occurredAt": "2026-05-04T10:00:00.000Z",
  "workspaceId": "wsp_...",
  "tenantExternalId": "tenant_demo",
  "mailboxId": "mbx_...",
  "data": {
    "messageId": "msg_...",
    "threadId": "thr_...",
    "providerMessageId": "195f8c...",
    "providerThreadId": "195f8b...",
    "subject": "Hello",
    "snippet": "Email snippet...",
    "receivedAt": "2026-05-04T09:59:00.000Z",
    "labelIds": ["INBOX", "UNREAD"]
  }
}
```

Webhook requests include:

```text
x-mailmon-delivery-id
x-mailmon-event-id
x-mailmon-attempt
x-mailmon-signature
```

Signature format:

```text
t=<timestamp>,v1=<hex_hmac>
```

Signed payload:

```text
<timestamp>.<raw_body>
```

> [!IMPORTANT]
> Webhook delivery is at-least-once. Consumers must deduplicate by `event.id`.

## Runtime modes

### Local mode

Used for development.

- API dispatches sync to the local worker
- webhook delivery can run through local scheduler/CLI
- internal worker routes do not require OIDC auth
- no local Pub/Sub or Cloud Tasks required

```bash
MAILMON_ASYNC_TRANSPORT_MODE=local
```

### GCP mode

Used for staging/production.

- API publishes sync requests to Pub/Sub
- Pub/Sub pushes sync jobs to the worker
- Gmail push arrives through Pub/Sub
- Cloud Tasks schedules webhook delivery
- Cloud Scheduler runs control jobs
- worker internal routes verify Google OIDC tokens

```bash
MAILMON_ASYNC_TRANSPORT_MODE=gcp
```

> [!NOTE]
> Mailmon is GCP-native. We optimize for Pub/Sub, Cloud Tasks, and Cloud SQL. We do not target cloud-agnostic or Kubernetes-generic deployments.

GCP deployments commonly set:

```bash
GCP_PROJECT_ID=...
GCP_REGION=...
MAILMON_WORKER_BASE_URL=...
MAILMON_GMAIL_PUBSUB_TOPIC_NAME=...
MAILMON_SYNC_DISPATCH_PUBSUB_TOPIC_NAME=...
MAILMON_GCP_TASKS_SERVICE_ACCOUNT_EMAIL=...
MAILMON_GCP_SCHEDULER_SERVICE_ACCOUNT_EMAIL=...
MAILMON_GCP_WEBHOOK_DELIVERY_QUEUE_ID=mailmon-webhook-deliveries
MAILMON_GCP_TASKS_AUDIENCE=...
```

## Deployment model

The `infra/` directory contains Terraform for the GCP topology:

```mermaid
flowchart LR
    API[Cloud Run API] --> SQL[(Cloud SQL PostgreSQL)]
    Worker[Cloud Run Worker] --> SQL
    GmailPush[Pub/Sub Gmail Push] --> Worker
    SyncTopic[Pub/Sub Sync Dispatch] --> Worker
    DLQ[Pub/Sub Dead Letter] --> Worker
    Tasks[Cloud Tasks] --> Worker
    Scheduler[Cloud Scheduler] --> Worker
    Secrets[Secret Manager + KMS] --> API
    Secrets --> Worker
```

Staging/production resources include:

- Cloud Run API
- Cloud Run worker
- Cloud SQL PostgreSQL
- Pub/Sub topic for Gmail push
- Pub/Sub topic for mailbox sync dispatch
- Pub/Sub dead-letter topic for exhausted sync dispatch
- Cloud Tasks queue for webhook delivery
- Cloud Scheduler jobs for watch renewal and stuck sync recovery
- Secret Manager and KMS for secrets
- Cloud Logging metrics and alert policies

## Development commands

```bash
pnpm install          # Install dependencies
pnpm docker:up        # Start local containers
pnpm dev              # Run API and worker
pnpm build            # Build all packages
pnpm test             # Run tests
pnpm lint             # Lint and format check
```

For full reference (migrations, coverage, watch modes), see [Development Guide](docs/DEVELOPMENT.md).

## Roadmap

Near-term work:

1. Broader end-to-end coverage for cloud transport and failure recovery
   - cross-service GCP mode flows
   - Pub/Sub and Cloud Tasks retry behavior
   - control-job behavior against production-like runtimes

2. Operator lifecycle
   - API key labels
   - `last_used_at`
   - key rotation UX
   - audit logs

3. Public docs
   - API reference
   - webhook verification guide
   - deployment guide
   - sync guarantees document

## Notes for reviewers

This project is best evaluated as infrastructure work.

The interesting parts are not the HTTP routes. The interesting parts are the failure boundaries:

- mailbox lease acquisition and recovery
- cursor-safe sync commits
- durable event creation
- retryable webhook delivery
- transport-neutral core use cases
- local vs GCP runtime adapters
- resource-level operational state

A reliable email sync system should be able to answer:

- Which worker owns this mailbox?
- Has the cursor advanced?
- Were state writes committed?
- Were events created?
- Were webhooks delivered?
- Can failed work be retried?
- Can historical events be replayed?
- Can an operator explain the current state?

Mailmon is built around those questions.
