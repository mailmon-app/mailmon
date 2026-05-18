# Internal Route Load Smoke

These k6 scenarios exercise the worker's internal HTTP routes for the
`internal-route-load-maintains-backpressure` property. They are report-only:
budgets are written into JSON output, but failures do not fail the k6 process
until the team promotes the budgets to enforced thresholds.

## Scenarios

- `load/internal-sync.k6.js`: sends many `/internal/sync` requests across a
  small mailbox set to expose active lease contention and retryable worker
  responses.
- `load/webhook-deliveries.k6.js`: sends many
  `/internal/webhook-deliveries` requests across a small delivery set to expose
  webhook claim contention and retry/failure classification.

## Local Run

Start a local worker test topology first, then run:

```bash
scripts/run-load-smoke.sh
```

The wrapper uses a host `k6` binary when available. If `k6` is not installed,
it falls back to `docker run grafana/k6:latest` with `--network host` by
default and the host UID/GID for report-file ownership. Host networking keeps
`http://127.0.0.1:3001` pointed at the host worker on Linux. Set
`MAILMON_LOAD_DOCKER_NETWORK=none` to omit the Docker network flag, or set
`MAILMON_LOAD_WORKER_BASE_URL=http://host.docker.internal:3001` when running on a
Docker setup that does not support host networking.

Run one scenario:

```bash
scripts/run-load-smoke.sh sync
scripts/run-load-smoke.sh webhooks
```

JSON reports are written to `load/results/` by default.

## Common Environment

- `MAILMON_LOAD_WORKER_BASE_URL`: worker URL. Default:
  `http://127.0.0.1:3001`.
- `MAILMON_LOAD_AUTHORIZATION`: optional full `Authorization` header value for
  staging, for example `Bearer <id-token>`.
- `MAILMON_LOAD_REQUEST_TIMEOUT`: k6 request timeout. Default: `10s`.
- `MAILMON_LOAD_REPORT_PATH`: override the JSON report path for a single run.
- `MAILMON_LOAD_DB_POOL_SATURATION`: optional externally collected DB pool
  saturation ratio to include in the report.

## Sync Scenario Environment

- `MAILMON_LOAD_SYNC_MAILBOX_IDS`: comma-separated mailbox IDs. If omitted,
  generated IDs use `MAILMON_LOAD_SYNC_MAILBOX_ID_PREFIX`.
- `MAILMON_LOAD_SYNC_MAILBOX_SET_SIZE`: generated mailbox set size. Default:
  `4`.
- `MAILMON_LOAD_SYNC_VUS`: virtual users. Default: `16`.
- `MAILMON_LOAD_SYNC_DURATION`: duration. Default: `30s`.
- `MAILMON_LOAD_SYNC_ENVELOPE`: set to `gcp-pubsub` to send Pub/Sub push
  envelopes instead of local raw JSON.

## Webhook Scenario Environment

- `MAILMON_LOAD_WEBHOOK_DELIVERY_IDS`: comma-separated delivery IDs. If omitted,
  generated IDs use `MAILMON_LOAD_WEBHOOK_DELIVERY_ID_PREFIX`.
- `MAILMON_LOAD_WEBHOOK_DELIVERY_SET_SIZE`: generated delivery set size.
  Default: `16`.
- `MAILMON_LOAD_WEBHOOK_VUS`: virtual users. Default: `16`.
- `MAILMON_LOAD_WEBHOOK_DURATION`: duration. Default: `30s`.
- `MAILMON_LOAD_WEBHOOK_PROCESSING_ROWS_AFTER_SETTLE`: optional externally
  collected processing-row count after the run settles.

## Report-Only Budgets

The default beta budgets are intentionally conservative and non-enforcing:

- route p95 latency: 2000 ms
- route p99 latency: 5000 ms
- retryable 5xx response rate: 25%
- DB pool saturation: 85%, when supplied externally
- sync lease contention rate: 95%
- webhook claim contention rate: 95%
- webhook processing rows after settle: 0, when supplied externally
