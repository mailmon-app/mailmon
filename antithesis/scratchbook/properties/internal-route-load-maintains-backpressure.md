# internal-route-load-maintains-backpressure

## Evidence

`docs/testing-requirements.md` names load and performance testing as remaining work: high concurrency against `/internal/sync` and `/internal/webhook-deliveries`, Postgres pool pressure, lease acquisition contention, and explicit pass/fail budgets. Existing tests validate route behavior and DB state transitions, but they are not repeatable load scenarios.

High-risk interactions:

- many `/internal/sync` calls for the same mailbox causing lease contention
- many `/internal/sync` calls across mailboxes causing DB pool pressure
- concurrent `/internal/webhook-deliveries` calls for the same delivery causing claim contention
- retryable route failures returning non-`2xx` so transport retries remain visible

## Proposed Workload

Create a k6, Artillery, or lightweight Node scenario that drives bounded concurrency against worker internal routes with synthetic mailboxes and deliveries. The workload should record:

- p95/p99 route latency
- rate of explicit retryable responses
- DB pool pressure if observable
- lease contention and webhook claim contention counts
- absence of unhandled exceptions and corrupted durable state

## Instrumentation Notes

Native Antithesis assertions are missing. This may be better as local load testing than native Antithesis at first, because pass/fail budgets are numeric and environment-dependent. SUT-side `Reachable` assertions for contention outcomes would still help later fault runs.

## Open Questions

- What p95/p99 latency, DB pool, and error-rate budgets should define pass/fail for early beta? These budgets are product/ops decisions and are not documented in the repo.

### Investigation Log

#### What p95/p99 latency, DB pool, and error-rate budgets should define pass/fail?

- Examined: `docs/testing-requirements.md`, `docs/launch-readiness.md`, and `plans/archive/cloudflare/cloudflare-findings.md`.
- Found: all three identify load/performance or migration baseline needs.
- Not found: numeric pass/fail thresholds or expected beta traffic shape.
- Conclusion: tagged `(needs human input)` in the catalog.
