# Cloudflare Migration Due Diligence Findings

Date: 2026-05-12

Scope reviewed:

- `plans/cloudflare-migration-detailed-docs.md`
- `plans/clouldflare-strategy.md`
- Current local repo architecture, infrastructure, tests, and deployment docs
- Current primary vendor docs from Google/Gmail/GCP and Cloudflare

## Executive Verdict

The main conclusion in both Cloudflare plans is correct: a pure zero-GCP migration is not compatible with Mailmon's current Gmail push design. Gmail `users.watch` still requires a Google Cloud Pub/Sub topic whose project id matches the Google developer project executing the watch request. Keeping Gmail push means keeping at least a minimal Google Pub/Sub island.

The second major conclusion is also correct: Postgres is the correctness anchor today. Mailmon's lease ownership, sync run state, cursor advancement, canonical message/thread writes, mailbox event emission, and sync completion are all deliberately tied to the same database transaction boundary. Replacing that with Durable Objects or edge state early would weaken the strongest invariant in the system.

The docs are weaker on cost and edge-delivery claims. Cloudflare is likely cheaper for some front-door, egress-heavy, and low-CPU request paths, but the plans overstate this as "massive" without production volumes. Cloudflare Queues are priced per operation, not per delivered job, and Durable Objects, Workers Logs, R2 operations, Hyperdrive, and any external Postgres provider all need a real workload model.

Recommended direction: proceed only with a phased hybrid design. Use Cloudflare first as front door, security layer, observability/control point, and possibly selected edge ingress. Keep Postgres as system of record. Keep GCP Pub/Sub for Gmail push. Defer a Workers/Queues/Hyperdrive runtime port until there is parity testing, load data, and a rollback path.

## Claim Verification Summary

| Claim                                                              | Verdict                            | Finding                                                                                                                                                                             |
| ------------------------------------------------------------------ | ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Gmail push requires GCP Pub/Sub                                    | Supported                          | Gmail docs explicitly require a fully qualified Cloud Pub/Sub topic and same developer project id for `users.watch`.                                                                |
| Zero-GCP is impossible without polling/product changes             | Supported                          | True while Mailmon requires Gmail push. Polling is the alternative, but that is a product/SLO/cost change.                                                                          |
| Existing sync correctness depends on Postgres transactions         | Supported                          | Repo code commits cursor, mailbox state, event rows, and sync run completion inside a DB transaction after checking the active lease.                                               |
| Durable Objects are single-threaded and useful for coordination    | Supported                          | Cloudflare docs support this, but they do not make DO storage transactional with Postgres.                                                                                          |
| Replacing DB leases with DO leases creates split-brain risk        | Supported as architecture analysis | Correct risk. A DO can serialize calls, but cannot atomically commit Mailmon's Postgres cursor/events with its own state.                                                           |
| Cloudflare Queues have 128 KB messages and 15-minute consumers     | Supported                          | Current Queues docs list both limits.                                                                                                                                               |
| Long historical syncs must be chunked on Queues/Cron               | Supported                          | Queue consumers and Cron handlers have 15-minute wall-clock limits; `waitUntil` only extends HTTP work by 30 seconds after response/client disconnect.                              |
| R2 claim-check is required if raw email bodies exceed queue limits | Partially supported                | A claim-check pattern is right, and R2 has free egress, but R2 is only one object-store choice and still has storage/operation costs. Current repo stores metadata, not raw bodies. |
| Hyperdrive can pool Postgres connections for Workers               | Supported                          | Hyperdrive supports Postgres and common drivers/ORMs, including Drizzle patterns. It has unsupported features that must be checked.                                                 |
| Smart Placement solves Worker-to-database latency                  | Partially supported                | Placement can run fetch handlers closer to backends, but it is not a universal fix and docs say Smart Placement only affects fetch handlers. Benchmark before relying on it.        |
| Moving webhook delivery to edge drastically lowers latency         | Overstated                         | It can reduce network distance to customer endpoints, but delivery also depends on DB reads/writes, retry state, queue placement, and endpoint behavior. Needs measurement.         |
| Cloudflare cost reduction is massive                               | Unsupported as stated              | Unit prices are attractive, but actual savings need traffic, mailbox count, webhook fan-out, retry volume, log volume, DB size, and current GCP bill.                               |
| Cloudflare charges zero egress                                     | Too broad                          | R2 egress is free and Queues have no egress/throughput fees. Do not generalize that to every Cloudflare product/contract without checking.                                          |
| Existing plan should be phased                                     | Supported                          | The safest sequence is front door first, async/core last, with baseline hardening before any transport cutover.                                                                     |

## Local Repo Findings

### Current deployment is explicitly GCP-shaped

`docs/deployment-guide.md` describes the live deployment model as Cloud Run, Cloud SQL, Cloud Tasks, Pub/Sub for Gmail push, Pub/Sub for mailbox sync dispatch, Cloud Scheduler, Secret Manager, KMS, and Artifact Registry.

The infrastructure confirms that:

- `infra/main.tf` creates a Gmail push Pub/Sub topic and grants `gmail-api-push@system.gserviceaccount.com` publisher permission.
- `infra/main.tf` creates separate Pub/Sub topics for mailbox sync dispatch and dead-letter dispatch.
- `infra/main.tf` creates a Cloud Tasks queue for webhook delivery scheduling.
- API and worker Cloud Run services run with `MAILMON_ASYNC_TRANSPORT_MODE=gcp`.
- The worker receives `MAILMON_GMAIL_PUBSUB_TOPIC_NAME`, `MAILMON_SYNC_DISPATCH_PUBSUB_TOPIC_NAME`, `GCP_PROJECT_ID`, `GCP_REGION`, and Cloud Tasks service-account configuration.

This is not a config-only move to Cloudflare. It is a runtime and operations port.

### Postgres is the source of truth

The schema has mailbox-scoped sync state and lease columns on `mailboxes`, including `cursor`, `activeSyncLeaseOwner`, lease timestamps, and `activeSyncRunId`. The same schema stores `sync_runs`, `mailbox_events`, and `webhook_deliveries`.

The persistence layer's `applySyncResult` checks the active lease, rejects cursor regression, writes messages/threads, inserts mailbox events, clears the lease, advances the cursor, and completes the sync run inside one `database.db.transaction(...)`.

The core sync execution uses that contract directly: acquire DB lease, heartbeat it, run provider sync, call `applySyncResult`, schedule webhook deliveries, and classify lease loss if the commit is rejected.

This validates the plans' warning: moving lease ownership to Durable Objects before moving the canonical state boundary would create two authorities.

### Current queue adapters are GCP adapters

`packages/queue/src/index.ts` imports `@google-cloud/pubsub` and `@google-cloud/tasks`. It publishes mailbox sync jobs to Pub/Sub and schedules webhook deliveries through Cloud Tasks with deterministic task ids and optional OIDC tokens.

Cloudflare Queues can plausibly replace internal dispatch later, but it needs a new adapter with equivalent behavior for:

- delayed delivery
- explicit retry/backoff behavior
- dead-letter handling
- idempotent scheduling
- durable recovery when scheduling fails
- worker HTTP status semantics

### Current runtime is Node-server based

`apps/api` and `apps/worker` depend on `@hono/node-server` and start Node HTTP servers. The worker uses `google-auth-library` to verify Google OIDC bearer tokens. The DB package uses `postgres` and Drizzle. The Gmail package uses `node:crypto`.

Cloudflare's Node.js compatibility is much stronger than it used to be, but it remains a subset with partial APIs and stubs. The current app should be treated as portable core logic plus Node adapters, not as Worker-ready entrypoints.

### Documentation drift exists

The short and long Cloudflare plans correctly call out stale local docs. `docs/DEVELOPMENT.md` still lists `pnpm db:push`, `pnpm dev:api`, and `pnpm dev:worker`, but root `package.json` only exposes `pnpm dev`, `pnpm db:generate`, and `pnpm db:migrate`. The same guide's debugging SQL refers to `created_at` ordering and a `mailbox_leases` table that do not match the current schema.

This matters because migration runbooks are only as safe as their operational accuracy. Fix this before any platform migration.

## Vendor Research Findings

### Gmail and GCP

Gmail push remains Cloud Pub/Sub based.

- Gmail `users.watch` requires `topicName` to be a fully qualified Google Cloud Pub/Sub topic, and the project id in the topic name must match the developer project executing the watch request.
- Gmail's push guide says watches must be renewed at least every 7 days and recommends daily renewal.
- Gmail publishes to Pub/Sub using `gmail-api-push@system.gserviceaccount.com`; Mailmon's Terraform grants that account publisher permission.
- Google Pub/Sub push subscriptions can authenticate push requests with an OIDC JWT in the `Authorization` header. A Cloudflare Worker endpoint can verify this, but the current `google-auth-library` Node path should not be assumed to run unchanged in Workers.

Primary sources:

- Gmail `users.watch`: https://developers.google.com/workspace/gmail/api/reference/rest/v1/users/watch
- Gmail push guide: https://developers.google.com/workspace/gmail/api/guides/push
- Pub/Sub authenticated push: https://cloud.google.com/pubsub/docs/authenticate-push-subscriptions

### Cloudflare Workers and Queues

Workers are a plausible runtime target, but not a lift-and-shift.

- Workers Paid/Standard includes 10M requests/month and charges $0.30 per additional million requests.
- Workers have 128 MB memory per isolate and CPU limits. HTTP duration has no hard wall-clock limit while the client stays connected, but background work after a response/client disconnect needs `waitUntil`, which is limited to 30 seconds.
- Queue consumers have 15-minute wall-clock duration, 128 KB message size, configurable retention up to 14 days on paid plans, max 100 retries, and max 24-hour delay per send/retry.
- Queues pricing is per operation, usually write + read + delete for a delivered message. A delivered message is commonly closer to three billable operations, and retries add read operations. The plan's "$0.40/1M ops" claim is not wrong, but interpreting it as "$0.40/1M jobs" would be wrong.
- Queue consumers retry whole batches unless individual messages are acknowledged.

Primary sources:

- Workers limits: https://developers.cloudflare.com/workers/platform/limits/
- Workers pricing: https://developers.cloudflare.com/workers/platform/pricing/
- `ctx.waitUntil`: https://developers.cloudflare.com/workers/runtime-apis/context/
- Queues limits: https://developers.cloudflare.com/queues/platform/limits/
- Queues pricing: https://developers.cloudflare.com/queues/platform/pricing/
- Queues retries/delays: https://developers.cloudflare.com/queues/configuration/batching-retries/
- Queues DLQ: https://developers.cloudflare.com/queues/configuration/dead-letter-queues/

### Durable Objects

Durable Objects are well suited to per-mailbox coordination if Mailmon later needs it.

Cloudflare describes each Durable Object as single-threaded, globally unique, and stateful with persistent storage. Their docs explicitly recommend using DOs for stateful coordination and strong consistency, and avoiding a single global singleton.

That supports a later per-mailbox DO as an admission controller or serializer. It does not support replacing Mailmon's DB transaction boundary now.

Primary sources:

- Durable Object rules: https://developers.cloudflare.com/durable-objects/best-practices/rules-of-durable-objects/
- Durable Object overview: https://developers.cloudflare.com/durable-objects/
- Durable Object pricing: https://developers.cloudflare.com/durable-objects/platform/pricing/

### Hyperdrive and database placement

Hyperdrive is viable but needs a compatibility and latency proof.

- Hyperdrive supports PostgreSQL 9.0 to 17.x and managed Postgres providers, including Google Cloud managed databases.
- It supports common Postgres drivers/ORMs, including Drizzle with `pg`, and Postgres.js is listed as supported.
- Unsupported Postgres features include advisory locks, `LISTEN`/`NOTIFY`, SQL-level prepared statement management, and undocumented per-session state changes.
- Hyperdrive pools connections near the origin database. That reduces connection setup and connection pressure but does not eliminate the latency of uncached transactional queries.
- Workers Placement can run fetch handlers closer to backend infrastructure. Cloudflare docs note that Smart Placement only affects fetch event handlers, so queue/cron-heavy designs need specific validation.

Primary sources:

- Hyperdrive supported databases/features: https://developers.cloudflare.com/hyperdrive/reference/supported-databases-and-features/
- Hyperdrive connection pooling: https://developers.cloudflare.com/hyperdrive/configuration/connection-pooling/
- Hyperdrive Postgres/Drizzle examples: https://developers.cloudflare.com/hyperdrive/examples/connect-to-postgres/postgres-drivers-and-libraries/drizzle-orm/
- Workers placement: https://developers.cloudflare.com/workers/configuration/placement/

### Front door, security, and observability

Cloudflare is strongest as a front-door/security layer.

- Proxied DNS records use Auto TTL of 300 seconds.
- Universal SSL issues and renews edge certificates automatically for active Cloudflare zones.
- Tunnel gives outbound-only origin connectivity, which can hide origins from direct inbound access.
- Load Balancing supports health checks, pools, failover, and steering.
- WAF rate limiting is useful for abuse mitigation but not strict global quota enforcement. Cloudflare says counters are not shared globally across all data centers.
- Workers observability provides request/error, CPU time, wall time, execution duration, Workers Logs, Logpush, and OTLP export. Workers Logs retention is limited: Paid plan includes 7-day retention and 20M log events/month before overage.

Primary sources:

- DNS proxied TTL: https://developers.cloudflare.com/dns/manage-dns-records/reference/ttl/
- Universal SSL: https://developers.cloudflare.com/ssl/edge-certificates/universal-ssl/
- Cloudflare Tunnel: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/
- Load Balancing: https://developers.cloudflare.com/load-balancing/understand-basics/load-balancing-components/
- WAF rate limit counters: https://developers.cloudflare.com/waf/rate-limiting-rules/request-rate/
- Workers observability: https://developers.cloudflare.com/workers/observability/
- Workers Logs: https://developers.cloudflare.com/workers/observability/logs/workers-logs/

### Cost claims

The short plan's direction is plausible but its language is too strong.

GCP pricing research:

- Cloud Run request-based billing charges CPU/memory while instances start, shut down, or process requests; minimum instances create idle charges.
- Cloud Tasks first 1M operations/month are free, then $0.40/M operations up to 5B; operations are chunked at 32 KB.
- Pub/Sub has a free 10 GiB monthly throughput tier, then $40/TiB for Message Delivery Basic, plus transfer/storage dimensions.
- Cloud SQL charges while the instance is on and charges for provisioned storage/backups.

Cloudflare pricing research:

- Workers Standard has low request pricing but CPU, logs, Queues, DOs, R2 operations/storage, and external database costs still matter.
- Queues are $0.40/M operations after 1M included operations, and a normal delivered message commonly consumes three operations.
- R2 egress is free, but storage and Class A/B operations are charged.
- Durable Objects have request, duration, and storage dimensions.

Conclusion: Cloudflare is likely cheaper for front-door and high-egress workloads, but the current plans do not have enough workload data to quantify total savings.

Primary sources:

- Cloud Run pricing: https://cloud.google.com/run/pricing
- Cloud Tasks pricing: https://cloud.google.com/tasks/pricing
- Pub/Sub pricing: https://cloud.google.com/pubsub/pricing
- Cloud SQL FAQ/pricing behavior: https://cloud.google.com/sql/docs/postgres/faq
- Workers pricing: https://developers.cloudflare.com/workers/platform/pricing/
- Queues pricing: https://developers.cloudflare.com/queues/platform/pricing/
- R2 pricing: https://developers.cloudflare.com/r2/pricing/
- Durable Objects pricing: https://developers.cloudflare.com/durable-objects/platform/pricing/

## Better Target Architecture

### Recommended architecture: hybrid with Postgres authority

```text
Gmail API
  -> Google Cloud Pub/Sub topic/subscription
  -> Cloudflare Worker Gmail ingress
  -> internal dispatch queue or regional worker
  -> Mailmon core sync workflow
  -> Postgres transaction boundary
  -> durable mailbox events
  -> webhook delivery scheduler/queue
  -> customer webhook endpoint
```

The important rule: only Postgres owns canonical mailbox state, cursor state, sync run state, event log state, and delivery state. Queues, Workers, Pub/Sub, Cloud Tasks, and Durable Objects are transport/admission mechanisms.

### Module boundaries to aim for

Keep or deepen these modules:

- `GmailPushIngress`: verifies Google Pub/Sub push identity, decodes Pub/Sub/Gmail envelope, emits mailbox wake-up.
- `MailboxSyncDispatcher`: transport-neutral enqueue interface with GCP Pub/Sub and Cloudflare Queues adapters.
- `WebhookDeliveryScheduler`: transport-neutral delayed scheduling interface with Cloud Tasks and Cloudflare Queues adapters.
- `MailboxSyncCoordinator`: remains DB-backed until production evidence proves a need for a DO serializer.
- `PostgresPersistence`: owns the commit boundary for leases, cursor advancement, canonical messages/threads, events, and sync run completion.
- `ControlJobRunner`: renew watches, recover stuck syncs, recover webhook scheduling; can be invoked by Cloud Scheduler now or Cloudflare Cron later.

This preserves leverage and locality: callers do not learn platform-specific queue/auth semantics, and platform migration stays behind adapters.

### Durable Object role, if ever added

Do not use Durable Objects as the source of truth for mailbox cursor, lease, or sync run status.

Acceptable later role:

- deterministic DO id per `mailboxId`
- receive mailbox wake-ups
- serialize or coalesce hot mailbox dispatches
- optionally store short-lived throttle/backoff hints
- call the core sync path, which still acquires the DB lease and commits in Postgres

Use this only if real production metrics show DB lease contention, duplicate wake-up pressure, or quota coordination pain.

### Webhook edge dispatch design

If webhook delivery moves to Cloudflare:

- Keep `webhook_deliveries` in Postgres as durable state.
- Put only `deliveryId` and `notBefore` in Cloudflare Queues.
- Worker reads delivery context from Postgres through Hyperdrive.
- Worker performs the customer HTTP POST.
- Worker records attempt result in Postgres.
- Retry/backoff remains explicit in Mailmon state, not only hidden in Queue retry state.
- Configure DLQ and a recovery job equivalent to the current durable recovery behavior.

This avoids losing delivery state when a queue retry path behaves differently than Cloud Tasks.

### Gmail watch renewal and control jobs

Cloudflare Cron Workers can eventually replace Cloud Scheduler for control jobs, but only after DB/Hyperdrive parity and observability are proven. Cron invocations have a 15-minute wall-clock limit, which is fine for batched daily watch renewal if the job remains chunked.

Keep Google Cloud Scheduler initially unless the near-term goal is specifically to shrink the GCP footprint beyond Gmail Pub/Sub.

## Recommended Migration Plan

### Phase 0: Baseline hardening

Do this before changing platforms:

- Fix `docs/DEVELOPMENT.md` command/table drift.
- Add a Cloudflare migration parity checklist.
- Add adapter contract tests for queue semantics: delay, retry, DLQ, idempotent scheduling, auth failure, and worker `5xx`.
- Add a repeatable load test for `/internal/sync` and `/internal/webhook-deliveries`.
- Add chaos tests for worker death during sync and database impairment.
- Record current GCP bill, mailbox count, webhook fan-out, retry volume, log volume, p95/p99 DB latency, sync duration distribution, and delivery latency.

### Phase 1: Cloudflare front door over existing GCP

Use Cloudflare DNS, TLS, WAF, and rate limiting in front of existing Cloud Run origins.

Exit criteria:

- no auth regression
- no webhook or Gmail push regression
- p95/p99 latency unchanged or better
- origin protection plan in place, either Cloud Run ingress restrictions, Cloud Armor/origin controls, Tunnel, or Load Balancing as appropriate
- dashboards include Cloudflare and GCP request/error views

### Phase 2: Cloudflare edge ingress, not core compute

Move narrow ingress functions first:

- public request normalization/protection where DB access is minimal
- Gmail Pub/Sub push ingress Worker that verifies Google OIDC and forwards normalized jobs
- optionally a webhook-delivery egress Worker in shadow mode

Do not move sync execution yet.

Exit criteria:

- Google OIDC verification works without Node-only assumptions
- Pub/Sub retries and Worker HTTP status behavior are proven
- logs/traces correlate Pub/Sub message id, mailbox id, sync run id, and delivery id
- rollback is a route flip, not a data migration

### Phase 3: Cloudflare Queues for selected async paths

Start with webhook delivery scheduling only if parity tests pass. Keep mailbox sync dispatch on GCP Pub/Sub until Gmail push and sync dispatch can be separated cleanly.

Exit criteria:

- Cloudflare Queue delays/backoff/DLQ match Mailmon's delivery contract
- durable recovery can re-arm pending/stale deliveries
- cost model accounts for write/read/delete/retry operations
- no loss of idempotency from batch retry behavior

### Phase 4: Worker-native DB-bound compute

Only now port API/worker compute to Workers + Hyperdrive or keep it on Cloud Run if benchmarks say the regional database dominates.

Exit criteria:

- DB latency and connection pool pressure under load are acceptable
- Postgres driver/Drizzle behavior is compatible with Hyperdrive
- migrations remain a controlled job, not an edge runtime side effect
- CPU/memory budgets fit Workers limits
- live Gmail and webhook E2E tests pass

### Phase 5: Optional per-mailbox Durable Object serializer

Evaluate only with production evidence of contention. Keep Postgres as the commit authority.

Exit criteria:

- measurable reduction in duplicate wake-ups or lease contention
- no cursor/event/state divergence
- clear kill switch back to DB-only leases

## Concrete Corrections To The Existing Plans

1. Change "Cloudflare charges $0 for egress" to product-specific wording. R2 egress is free; Queues have no egress/throughput charges; do not generalize.
2. Change "Queues included first 1M free, $0.40/1M ops after" to clarify operations-per-message. Normal delivery is usually write + read + delete, and retries add reads.
3. Change "Workers closest to customer endpoint drastically minimizes webhook latency" to "may reduce network distance; must be benchmarked because DB and retry-state round trips may dominate."
4. Change "Smart Placement solves DB hops" to "Smart/Placement Hints may help fetch handlers; queue/cron behavior and DB-bound hot paths need benchmark validation."
5. Add Hyperdrive compatibility caveats: no advisory locks, no `LISTEN`/`NOTIFY`, no SQL-level prepared statement management, and session-state restrictions.
6. Add a baseline-hardening phase before edge front door.
7. Add explicit rollback criteria for every phase.
8. Add "Cloudflare Cron can replace Cloud Scheduler later" as optional, not immediate.
9. Add "Gmail Pub/Sub push subscription can push to a Cloudflare Worker with OIDC verification" as the cleanest minimal GCP island.
10. Keep "DO Optimization" explicitly optional and subordinate to DB transactions.

## Final Recommendation

Proceed with Cloudflare adoption, but only as a hybrid architecture:

- Yes: Cloudflare DNS, TLS, WAF, front-door proxying, observability, and carefully selected edge ingress.
- Yes: evaluate Cloudflare Queues for webhook delivery scheduling after adapter parity tests.
- Maybe: Workers + Hyperdrive for DB-bound compute after benchmark and compatibility testing.
- Maybe later: per-mailbox Durable Objects as a serializer, never as canonical sync state.
- No: zero-GCP while using Gmail push.
- No: replacing DB leases/cursors/events with Cloudflare edge state in early phases.
- No: committing to cost savings without workload data.

The best architecture is not "GCP versus Cloudflare." It is "Postgres-owned domain correctness with replaceable transport adapters, Cloudflare at the edge where it adds leverage, and a minimal Google Pub/Sub island where Gmail requires it."

## Local Evidence Index

Key local references used for repo-specific claims:

- `docs/deployment-guide.md:8-22` lists the current GCP deployment model and states that Pub/Sub/Cloud Tasks are not the source of truth.
- `infra/main.tf:312-323` creates the Gmail Pub/Sub topic and grants Gmail publisher permission.
- `infra/main.tf:325-375` creates internal Pub/Sub dispatch topics and the Cloud Tasks webhook queue.
- `infra/main.tf:390-520` configures the API Cloud Run service in GCP mode.
- `infra/main.tf:521-679` configures the worker Cloud Run service in GCP mode with Gmail Pub/Sub, sync Pub/Sub, Cloud Tasks, and Cloud SQL settings.
- `packages/db/src/schema.ts:42-64` stores mailbox cursor, watch state, and active sync lease fields on the `mailboxes` table.
- `packages/db/src/schema.ts:200-282` stores canonical message metadata, sync runs, and mailbox events.
- `packages/db/src/schema.ts:325-360` stores durable webhook delivery state.
- `packages/db/src/persistence.ts:3061-3381` applies sync results in one database transaction.
- `packages/db/src/persistence.ts:3851-3980` implements DB-backed sync lease acquire, renew, and release.
- `packages/core/src/mailbox-sync-execution.ts:173-280` wires lease acquisition, heartbeat, provider sync, DB commit, and delivery scheduling.
- `packages/queue/src/index.ts:1-4` imports Google Pub/Sub and Cloud Tasks SDKs.
- `packages/queue/src/index.ts:188-204` publishes mailbox sync dispatch to Pub/Sub.
- `apps/worker/src/server.ts:1-23` shows the Node/Hono worker runtime and Google auth dependency.
- `docs/testing-requirements.md:46-78` records missing migration-safety work around chaos/load/infrastructure testing.
- `package.json:5-31` shows root scripts; `docs/DEVELOPMENT.md:42-58` shows stale documented commands that do not exist at root.
