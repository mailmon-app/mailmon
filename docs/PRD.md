# Mailmon PRD v3 — Gmail Sync Infrastructure (Production-Grade)

## 1. Product Definition

Mailmon is a **Gmail-first sync and state infrastructure** that provides:

- correct mailbox state
- replayable change history
- safe event delivery

It replaces the entire email integration layer developers usually build poorly.

### Core statement

> Mailmon turns Gmail from an unreliable trigger source into a **correct, stateful, replayable system**.

---

## 2. Problem (Refined)

Developers integrating Gmail typically build:

- webhook → worker pipelines
- partial polling systems
- ad-hoc deduplication

These systems fail in production due to:

- missed changes (cursor bugs)
- duplicate processing
- lack of replay
- broken ordering
- no recovery path
- rate-limit collapse under load

The real problem is not "reading email".

It is:

> maintaining **correct mailbox state over time** under failures, retries, and scale.

---

## 3. Key Insight

Email is not a dataset.

It is:

> **a mutable state machine driven by an ordered change log (historyId)**

Therefore:

- sync must be cursor-based
- writes must be idempotent
- ordering must be respected
- replay must be possible

---

## 4. Product Scope (Strict v1)

### A. Mailbox Connectivity

- Gmail OAuth
- secure token storage (KMS-backed)
- token refresh + revocation handling

### B. Sync Engine (Core)

- full sync (initial state reconstruction)
- incremental sync via historyId
- single-flight per mailbox
- cursor lifecycle management
- retry + backoff
- rate-limit aware scheduling

### C. Canonical Mailbox State

Expose normalized:

- messages
- threads
- labels

### D. Event System

Emit:

- message.created
- message.updated
- thread.updated

With:

- stable event IDs
- at-least-once delivery

### E. Replay

- replay events by mailbox + time range
- deterministic re-delivery

### F. Observability

- sync runs
- cursor movement
- failure states

---

## 5. Explicitly Out of Scope (v1)

- AI features
- semantic signals (requires_reply etc.)
- inbox UI
- multi-provider (Outlook/IMAP)
- autonomous actions

---

## 6. System Architecture

```text
Gmail
 ↓
Push (Pub/Sub)
 ↓
Ingress (ack fast)
 ↓
Mailbox Queue (deduped)
 ↓
Sync Worker (1 per mailbox)
 ↓
Canonical DB
 ↓
Event Log
 ↓
Webhook Delivery
 ↓
Customer
```

---

## 7. Core Design Rules

### 7.1 Mailbox is the unit of work

- one cursor per mailbox
- one active sync per mailbox

### 7.2 State first, cursor second

- never advance cursor before durable writes

### 7.3 Push is not truth

- push = wake-up
- history API = source of truth

### 7.4 Idempotent writes

- upsert by (tenant_id, mailbox_id, provider_message_id)
- monotonic historyId guards

### 7.5 At-least-once everywhere

- sync replay
- webhook delivery

### 7.6 Backpressure over speed

- queue + rate limiting
- avoid API storms

---

## 8. Data Model (Core)

### mailboxes

- owns cursor, sync state, watch state

### messages

- canonical email objects
- idempotent upsert target

### threads

- grouping layer

### message_labels

- label state

### sync_runs

- operational debugging

### mailbox_events

- immutable event log
- replay source

### webhook_deliveries

- delivery attempts

---

## 9. Failure Modes (Handled)

### A. Duplicate notifications

→ dedup + single-flight

### B. Worker crash mid-sync

→ idempotent replay + cursor safety

### C. Token expiry (401)

→ refresh or reconnect_required

### D. Watch expiration

→ renewal scheduler + catch-up sync

### E. Rate limits (429 / 403)

→ exponential backoff + global throttling

### F. Missing events

→ replay + repair sync

---

## 10. Sync Lifecycle

### Initial (Full Sync)

- page through messages
- build baseline
- capture history boundary
- run catch-up incremental sync

### Incremental Sync

- fetch history since cursor
- apply idempotently
- commit cursor

---

## 11. API Surface (Developer-Facing)

Mailmon v1 must answer one practical question for developers:

> What do I actually call to integrate this?

The API surface should be small, explicit, and Gmail-first.

### 11.1 Authentication Model

Mailmon exposes a server-side API authenticated via project/workspace API keys.

There are two key types in v1:

- **live secret key**: production API access (prefix: `mm_live_`)
- **test secret key**: sandbox and local development only (prefix: `mm_test_`)

Keys support explicit rotation and revocation. A compromised key can be revoked immediately, permanently disabling access. API keys are generated securely, returning the raw string only once, while only a hash and the key prefix are stored durably.

Keys are scoped to a workspace. A workspace owns:

- mailboxes
- webhook endpoints
- replay jobs
- events

API keys may only access resources in their owning workspace.

#### Header format

```http
Authorization: Bearer <mailmon_api_key>
```

#### Key capabilities

- create mailbox connect sessions
- list and inspect mailboxes
- register webhook endpoints
- query messages and threads
- create replay jobs

End-user Gmail authorization uses Mailmon-hosted OAuth connect flows.

---

### 11.2 Connect a Mailbox

#### Create connect session

```http
POST /v1/mailboxes/connect-sessions
Authorization: Bearer <mailmon_api_key>
Content-Type: application/json

{
  "provider": "gmail",
  "tenant_external_id": "cust_123",
  "mailbox_external_id": "user_456",
  "redirect_url": "https://app.example.com/settings/integrations/gmail/callback"
}
```

#### Success response

```json
{
  "id": "mcs_123",
  "object": "connect_session",
  "connect_url": "https://connect.mailmon.dev/oauth/gmail/mcs_123",
  "expires_at": "2026-03-24T10:00:00Z"
}
```

Developer sends the user to `connect_url`.

After successful OAuth, Mailmon creates the mailbox resource and starts initial sync.

#### Duplicate mailbox behavior

If the requested Gmail account is already connected in the same workspace, Mailmon does **not** create a duplicate mailbox.

Instead it returns:

```http
409 Conflict
```

```json
{
  "type": "https://api.mailmon.dev/problems/mailbox-already-connected",
  "title": "Mailbox already connected",
  "status": 409,
  "code": "mailbox_already_connected",
  "detail": "This Gmail account is already connected in this workspace.",
  "resource": {
    "mailbox_id": "mbx_123"
  },
  "retryable": false
}
```

This forces mailbox identity to stay unique and avoids ambiguous duplicate state.

#### Fetch mailbox status

```http
GET /v1/mailboxes/{mailbox_id}
Authorization: Bearer <mailmon_api_key>
```

#### Response

```json
{
  "id": "mbx_123",
  "object": "mailbox",
  "provider": "gmail",
  "email_address": "user@gmail.com",
  "status": "active",
  "sync_state": "healthy",
  "watch_state": "active",
  "initialized_at": "2026-03-23T10:05:00Z",
  "last_successful_sync_at": "2026-03-23T10:06:10Z",
  "last_error": null
}
```

#### Mailbox resource states

`status`:

- `active`
- `reconnect_required`
- `disabled`

`sync_state`:

- `initializing`
- `healthy`
- `lagging`
- `failed`

`watch_state`:

- `active`
- `expiring`
- `expired`
- `unhealthy`

Important distinction:

- **request-level errors** are returned as HTTP errors
- **mailbox operational problems** are surfaced on the mailbox resource itself

Example:

```json
{
  "id": "mbx_123",
  "status": "reconnect_required",
  "sync_state": "failed",
  "watch_state": "expired",
  "last_error": {
    "code": "gmail_auth_revoked",
    "message": "The Gmail refresh token could not be refreshed.",
    "occurred_at": "2026-03-23T10:20:00Z",
    "retryable": false
  }
}
```

---

### 11.3 Register a Webhook Endpoint

#### Create webhook endpoint

```http
POST /v1/webhook-endpoints
Authorization: Bearer <mailmon_api_key>
Content-Type: application/json

{
  "url": "https://app.example.com/webhooks/mailmon",
  "description": "production inbox events"
}
```

#### Response

```json
{
  "id": "whe_123",
  "object": "webhook_endpoint",
  "url": "https://app.example.com/webhooks/mailmon",
  "secret": "whsec_...",
  "created_at": "2026-03-23T10:10:00Z"
}
```

The secret is shown once and used by the customer to verify webhook signatures.

#### Update webhook subscriptions

```http
POST /v1/webhook-endpoints/{endpoint_id}/subscriptions
Authorization: Bearer <mailmon_api_key>
Content-Type: application/json

{
  "event_types": [
    "message.created",
    "message.updated",
    "thread.updated"
  ],
  "mailbox_ids": ["mbx_123"]
}
```

#### Webhook endpoint health

Webhook delivery failures are **not** surfaced as request errors on unrelated API calls.
They are represented on the webhook endpoint resource and in delivery logs.

Example endpoint health fields:

- `delivery_state`: `healthy | degraded | failing`
- `last_delivery_at`
- `last_delivery_error`

---

### 11.4 Webhook Payload Shape

Mailmon delivers events with at-least-once semantics and stable event IDs.

#### Example delivery

```http
POST https://app.example.com/webhooks/mailmon
X-Mailmon-Signature: t=1711188000,v1=...
Content-Type: application/json
```

```json
{
  "id": "evt_123",
  "type": "message.created",
  "schemaVersion": 1,
  "occurredAt": "2026-03-23T10:11:22Z",
  "workspaceId": "ws_123",
  "tenantExternalId": "cust_123",
  "mailboxId": "mbx_123",
  "data": {
    "messageId": "msg_123",
    "threadId": "thr_123",
    "providerMessageId": "195f8c...",
    "providerThreadId": "195f8b...",
    "subject": "Interview availability",
    "snippet": "Could you share your availability...",
    "receivedAt": "2026-03-23T10:11:20Z",
    "labelIds": ["INBOX", "UNREAD"]
  }
}
```

#### Delivery contract

- stable `event.id`
- at-least-once delivery
- customer must deduplicate by `event.id`
- retries on timeout / 5xx
- replay may resend historical events with the same `event.id`

---

### 11.5 Query Messages

#### List messages for a mailbox

```http
GET /v1/messages?mailboxId=mbx_123&limit=50
Authorization: Bearer <mailmon_api_key>
```

#### Pagination contract

- results are mailbox-scoped and returned newest-first by `receivedAt`
- ties are broken deterministically by descending `message.id`
- omit `cursor` on the first page
- treat `cursor` and `nextCursor` as opaque tokens; clients must not parse or construct them
- when `nextCursor` is `null`, there are no more results

#### Response

```json
{
  "object": "list",
  "data": [
    {
      "id": "msg_123",
      "mailboxId": "mbx_123",
      "threadId": "thr_123",
      "providerMessageId": "195f8c...",
      "subject": "Interview availability",
      "from": { "name": "Jane", "email": "jane@acme.com" },
      "snippet": "Could you share your availability...",
      "receivedAt": "2026-03-23T10:11:20Z",
      "labelIds": ["INBOX", "UNREAD"]
    }
  ],
  "nextCursor": "cur_abc"
}
```

#### Follow-up page

```http
GET /v1/messages?mailboxId=mbx_123&limit=50&cursor=cur_abc
Authorization: Bearer <mailmon_api_key>
```

#### Get message

```http
GET /v1/messages/{message_id}
Authorization: Bearer <mailmon_api_key>
```

---

### 11.6 Query Threads

#### List threads for a mailbox

```http
GET /v1/threads?mailboxId=mbx_123&limit=50
Authorization: Bearer <mailmon_api_key>
```

#### Pagination contract

- results are mailbox-scoped and returned newest-first by `lastMessageAt`
- ties are broken deterministically by descending `thread.id`
- omit `cursor` on the first page
- treat `cursor` and `nextCursor` as opaque tokens; clients must not parse or construct them
- when `nextCursor` is `null`, there are no more results

#### Response

```json
{
  "object": "list",
  "data": [
    {
      "id": "thr_123",
      "object": "thread",
      "mailboxId": "mbx_123",
      "providerThreadId": "195f8b...",
      "subject": "Interview availability",
      "lastMessageAt": "2026-03-23T10:11:20Z"
    }
  ],
  "nextCursor": "cur_def"
}
```

#### Follow-up page

```http
GET /v1/threads?mailboxId=mbx_123&limit=50&cursor=cur_def
Authorization: Bearer <mailmon_api_key>
```

#### Get thread with messages

```http
GET /v1/threads/{thread_id}
Authorization: Bearer <mailmon_api_key>
```

#### Response

```json
{
  "id": "thr_123",
  "object": "thread",
  "mailboxId": "mbx_123",
  "providerThreadId": "195f8b...",
  "subject": "Interview availability",
  "lastMessageAt": "2026-03-23T10:11:20Z",
  "messages": [
    {
      "id": "msg_120",
      "subject": "Interview availability",
      "receivedAt": "2026-03-23T09:55:00Z"
    },
    {
      "id": "msg_123",
      "subject": "Re: Interview availability",
      "receivedAt": "2026-03-23T10:11:20Z"
    }
  ]
}
```

---

### 11.7 Trigger Replay

Replay is mailbox-scoped and time-range scoped.

#### Create replay job

```http
POST /v1/replays
Authorization: Bearer <mailmon_api_key>
Content-Type: application/json

{
  "mailbox_id": "mbx_123",
  "start_time": "2026-02-21T00:00:00Z",
  "end_time": "2026-03-23T00:00:00Z",
  "destination": {
    "type": "webhook_endpoint",
    "webhook_endpoint_id": "whe_123"
  }
}
```

#### Success response

```http
202 Accepted
```

```json
{
  "id": "rpl_123",
  "object": "replay",
  "status": "queued",
  "mailbox_id": "mbx_123",
  "start_time": "2026-02-21T00:00:00Z",
  "end_time": "2026-03-23T00:00:00Z"
}
```

#### Replay resource states

- `queued`
- `running`
- `completed`
- `failed`
- `cancelled`

#### Replay with empty range

If the time range contains no stored events, replay creation still succeeds.
This is **not** an error.

Reason: the request is valid; the result set is simply empty.

Example terminal replay state:

```json
{
  "id": "rpl_123",
  "status": "completed",
  "mailbox_id": "mbx_123",
  "events_replayed": 0
}
```

#### Replay conflict

If a replay for the same mailbox, destination, and overlapping time range is already actively running, Mailmon returns:

```http
409 Conflict
```

```json
{
  "type": "https://api.mailmon.dev/problems/replay-conflict",
  "title": "Replay conflict",
  "status": 409,
  "code": "replay_conflict",
  "detail": "An overlapping replay is already running for this mailbox and destination.",
  "resource": {
    "replay_id": "rpl_existing"
  },
  "retryable": true
}
```

#### Get replay status

```http
GET /v1/replays/{replay_id}
Authorization: Bearer <mailmon_api_key>
```

---

### 11.8 Local Development Story

A developer must be able to integrate Mailmon without owning Gmail Pub/Sub setup locally.

Mailmon v1 local-dev story:

#### Option A: Sandbox mailbox

- Mailmon provides a hosted test mailbox in sandbox mode
- developer can receive sample events without real Gmail OAuth

#### Option B: Event forwarding CLI

- Mailmon CLI can forward webhook deliveries to localhost

Example:

```bash
mailmon listen --forward-to http://localhost:3000/webhooks/mailmon
```

This is Stripe-CLI style forwarding for local webhook testing.

#### Option C: Fixture replay

- developer can replay recorded mailbox events into a local endpoint

Example:

```bash
mailmon replay --mailbox mbx_123 --last 1d --forward-to http://localhost:3000/webhooks/mailmon
```

Local dev requirements:

- no local Gmail Pub/Sub setup
- no local watch renewal infra
- deterministic webhook testing
- test signatures supported

---

## 12. Error Model

Mailmon uses a single structured error envelope for synchronous API failures.

### 12.1 Error envelope

```json
{
  "type": "https://api.mailmon.dev/problems/example",
  "title": "Human-readable summary",
  "status": 409,
  "code": "machine_readable_code",
  "detail": "Concrete explanation of what went wrong.",
  "resource": {
    "mailbox_id": "mbx_123"
  },
  "retryable": false
}
```

This is problem-details style and should remain consistent across endpoints.

### 12.2 Request-level vs resource-level errors

#### Request-level API errors

Returned as HTTP errors.

Examples:

- invalid API key
- missing mailbox
- mailbox already connected
- invalid replay range
- replay conflict
- webhook endpoint does not belong to workspace

#### Resource-level operational errors

Returned on resource objects, not as transport-level failures.

Examples:

- Gmail token revoked
- mailbox watch expired
- mailbox sync lagging
- webhook endpoint unhealthy
- replay job failed after creation

This distinction is intentional.
A request like `GET /v1/mailboxes/{id}` should still return `200` even if the mailbox is unhealthy.

### 12.3 Standard HTTP mappings

- `400 Bad Request` — malformed JSON or invalid shape
- `401 Unauthorized` — invalid API key
- `403 Forbidden` — workspace does not own resource
- `404 Not Found` — resource absent in workspace scope
- `409 Conflict` — duplicate connect or replay conflict
- `422 Unprocessable Entity` — semantically invalid request (example: end_time before start_time)
- `429 Too Many Requests` — Mailmon API rate limit exceeded
- `500 Internal Server Error` — unexpected Mailmon failure
- `503 Service Unavailable` — temporary Mailmon outage or degraded control plane

### 12.4 Mailmon 429 vs Gmail 429

#### Mailmon API 429

This means the customer is rate-limited by **Mailmon’s own API**.
It is a synchronous request failure.

Example:

```json
{
  "type": "https://api.mailmon.dev/problems/api-rate-limit",
  "title": "Rate limit exceeded",
  "status": 429,
  "code": "api_rate_limit_exceeded",
  "detail": "Too many API requests for this workspace.",
  "retryable": true
}
```

#### Gmail-originated 429 / 403

This is **not** surfaced as a synchronous API error to unrelated customer requests.
It is reflected as mailbox operational state.

Example mailbox state:

```json
{
  "id": "mbx_123",
  "sync_state": "lagging",
  "last_error": {
    "code": "gmail_rate_limited",
    "message": "Gmail temporarily rate-limited sync operations for this mailbox.",
    "retryable": true,
    "occurred_at": "2026-03-23T10:30:00Z"
  }
}
```

### 12.5 Replay errors

#### Invalid range

If `end_time <= start_time`:

```http
422 Unprocessable Entity
```

#### Mailbox not initialized

If replay is requested for a mailbox that has not completed initial sync:

```http
409 Conflict
```

```json
{
  "type": "https://api.mailmon.dev/problems/mailbox-not-initialized",
  "title": "Mailbox not initialized",
  "status": 409,
  "code": "mailbox_not_initialized",
  "detail": "Replay cannot start until the mailbox has completed initial sync.",
  "resource": {
    "mailbox_id": "mbx_123"
  },
  "retryable": true
}
```

### 12.6 Webhook delivery failures

Webhook delivery failure is not a synchronous API error on event creation because event delivery is asynchronous.

Instead:

- delivery attempts are recorded in `webhook_deliveries`
- endpoint health degrades after repeated failures
- replay may be used to redeliver historical events

### 12.7 Why this model exists

The error model must preserve one key distinction:

> synchronous request validation failures are API errors; asynchronous mailbox and delivery problems are resource state.

This keeps the API coherent and avoids overloading HTTP status codes with operational drift.

---

## 13. Event Delivery Contract

Guarantee:

> at-least-once delivery with stable event IDs

Customer must:

- deduplicate by event_id

System provides:

- retries
- delivery logs
- replay

---

## 12. Multi-Tenant Isolation

Enforced by:

- tenant_id on all tables
- composite keys
- tenant-scoped queries
- optional DB-level RLS

---

## 13. Security

- tokens encrypted with KMS (envelope encryption)
- least-privilege IAM
- no token logging
- TLS everywhere

---

## 14. Scaling Strategy

### At small scale (≤10 mailboxes)

- single Postgres
- simple queue
- advisory locks

### At large scale (≥100k mailboxes)

- partitioned tables (events, messages)
- queue partitioning by mailbox
- object storage for raw payloads
- strict index discipline
- retention policies

---

## 15. Success Metrics

### Correctness

- zero missed changes
- cursor monotonicity

### Reliability

- sync success rate
- retry recovery rate

### Performance

- sync lag per mailbox

### Developer value

- integrations replacing custom sync code

---

## 16. Risks

### 1. Weak differentiation

If seen as generic email API

### 2. Over-scope

Trying to build full platform too early

### 3. Underestimating correctness complexity

Cursor bugs = catastrophic

---

## 17. Final Statement

Mailmon is not an email client or API.

It is:

> **a correctness layer over Gmail — providing reliable state, ordered change processing, and replayable events so developers don’t have to build sync systems themselves.**
