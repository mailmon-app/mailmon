---
sut_path: /home/satty/projects/mailmon-dev
commit: 8f544ea13a0afb0b16f13e221dca8e20f4e989ab
updated: 2026-05-17
external_references:
  - path: https://github.com/hegeldev/hegel-typescript
    why: User-requested TypeScript property-based testing client; inspected README and source at e58959ae567cf49aaddabe2e04a5819c8e6f6850.
  - path: /home/satty/projects/mailmon-dev/.repos/hegel
    why: Local Hegel source used to verify runner settings, shrinking diagnostics, and Antithesis-output limitations in version 0.2.2.
  - path: /home/satty/projects/mailmon-dev/.repos/effect
    why: Local Effect source consulted for @effect/vitest and Effect testing patterns.
  - path: https://github.com/antithesishq/bombadil
    why: User-requested browser/UI property-based testing tool; inspected README and manual at ad98c7b5c36c6889dd05db4f08034b48374dda4a.
  - path: https://antithesis.com/docs/properties_assertions/assertions/
    why: Assertion taxonomy and property semantics used to classify properties.
  - path: https://antithesis.com/docs/best_practices/sometimes_assertions/
    why: Guidance for reachability/liveness-style properties.
  - path: https://antithesis.com/docs/using_antithesis/sdk/
    why: SDK runtime behavior and future portability notes.
  - path: https://antithesis.com/docs/using_antithesis/sdk/define_test_properties/
    why: Test property definition and assertion cataloging context.
  - path: https://antithesis.com/docs/using_antithesis/sdk/javascript_sdk/
    why: TypeScript/JavaScript instrumentation constraints for future platform use.
  - path: https://antithesis.com/docs/best_practices/optimizing/
    why: Test-environment tuning guidance.
  - path: /home/satty/projects/mailmon-dev/docs/testing-requirements.md
    why: Target testing requirements document for this reanalysis.
  - path: /home/satty/projects/mailmon-dev/docs/launch-readiness.md
    why: Cross-check for current launch and verification claims.
  - path: /home/satty/projects/mailmon-dev/docs/staging-validation-guide.md
    why: Manual live validation scope for Cloud Tasks and Gmail push/watch production paths.
  - path: /home/satty/projects/mailmon-dev/plans/archive/cloudflare/cloudflare-findings.md
    why: Independent plan noting chaos/load baselining as migration prerequisites.
---

# Deployment Topology

## Summary

Because there is no Antithesis platform access, the useful topology is local/CI PBT. Hegel properties now run as normal Vitest suites in the package test path. Bombadil is deferred until Mailmon has a product web interface worth browser fuzzing; docs and marketing are not targets for this roadmap. A future Antithesis topology is included only so later setup work has a concrete handoff.

## Local Hegel Topologies

### Pure Domain Properties

| Component      | Role            | What It Runs                                                                                    | Connections | Replica Count |
| -------------- | --------------- | ----------------------------------------------------------------------------------------------- | ----------- | ------------- |
| `vitest-hegel` | client/workload | `pnpm --filter @mailmon/core test` and `pnpm --filter @mailmon/gmail test` with Hegel PBT files | none        | 1             |

Use for:

- `history-delete-wins-compaction`
- `initial-sync-catchup-delete-wins`
- `label-ids-are-normalized`
- `webhook-retry-delay-bounded-monotonic`
- `terminal-webhook-outcomes-do-not-reschedule`
- `internal-worker-codecs-reject-malformed-envelopes`
- `pagination-cursors-roundtrip-and-reject-junk`

### DB-Backed State-Machine Properties

| Component         | Role            | Image/Source         | What It Runs                                                    | Connections | Replica Count |
| ----------------- | --------------- | -------------------- | --------------------------------------------------------------- | ----------- | ------------- |
| `postgres`        | dependency      | `postgres:17-alpine` | Isolated test database from existing harness                    | local TCP   | 1             |
| `vitest-hegel-db` | client/workload | host Node 22 / pnpm  | `pnpm --filter @mailmon/db test` with DB-backed Hegel PBT files | `postgres`  | 1             |

Use for:

- `mailbox-lease-single-flight`
- `lease-loss-prevents-stale-commit`
- `cursor-never-regresses`
- `state-cursor-events-commit-atomically`
- `sync-snapshot-application-is-idempotent`
- `thread-summary-follows-latest-message`
- `webhook-delivery-id-stable-dedupes-scheduling`
- `webhook-claim-is-exclusive-and-stale-recoverable`
- `replay-active-ranges-do-not-overlap`
- `replay-dispatch-is-single-claim-and-counted`

### Local API/Worker E2E PBT

| Component          | Role            | Image/Source                                                   | What It Runs                          | Connections                | Replica Count |
| ------------------ | --------------- | -------------------------------------------------------------- | ------------------------------------- | -------------------------- | ------------- |
| `postgres`         | dependency      | `postgres:17-alpine`                                           | Mailmon DB                            | API/worker                 | 1             |
| `api`              | service         | existing `Dockerfile` or host test harness                     | `@mailmon/api` in local mode          | postgres, worker           | 1             |
| `worker`           | service         | existing `Dockerfile` or host test harness                     | `@mailmon/worker` in local mode       | postgres, webhook receiver | 1             |
| `gmail-sandbox`    | dependency/mock | in-process HTTP server from `apps/api/src/sandbox-e2e.test.ts` | OAuth/Gmail API sandbox               | API/worker                 | 1             |
| `webhook-receiver` | dependency/mock | in-process HTTP server                                         | Generated endpoint behaviors          | worker                     | 1             |
| `hegel-e2e`        | client/workload | host Node 22 / pnpm                                            | generated API/Gmail/webhook scenarios | API, sandbox               | 1             |

Use for a small nightly suite only. It is more expensive and less shrink-friendly than core/DB properties.

## Deferred Bombadil Product Web Interface Topology

No current topology. Do not add a docs-server or marketing-site Bombadil lane. Revisit after a product web interface exists and has critical user workflows worth browser exploration.

## Future Antithesis-Compatible Minimal Topology

This is not actionable until platform access exists, but it keeps the local plan portable:

| Container          | Role            | Image Source                                          | What It Runs                               | Connections              | Replica Count |
| ------------------ | --------------- | ----------------------------------------------------- | ------------------------------------------ | ------------------------ | ------------- |
| `postgres`         | dependency      | `postgres:17-alpine`                                  | Mailmon DB                                 | api, worker, workload    | 1             |
| `api`              | service         | existing `Dockerfile` with `APP_NAME=@mailmon/api`    | public API in local async mode             | postgres, worker         | 1             |
| `worker`           | service         | existing `Dockerfile` with `APP_NAME=@mailmon/worker` | internal worker routes in local async mode | postgres, workload mocks | 1             |
| `gmail-sandbox`    | dependency/mock | new lightweight Node image                            | deterministic Gmail/OAuth sandbox          | api, worker, workload    | 1             |
| `webhook-receiver` | dependency/mock | new lightweight Node image                            | controllable customer webhook endpoint     | worker, workload         | 1             |
| `workload`         | client          | new Node image                                        | Hegel-generated HTTP and admin scenarios   | all services             | 1             |

Do not add Redis to the PBT topology unless testing `legacy_bullmq`; the current recommended local/gcp paths do not need it.

## Failure-Injection And Load Topologies

`docs/testing-requirements.md` now identifies these as the real roadmap beyond local Hegel. Keep the topology minimal and add only what each lane needs.

### Provider Failure E2E

| Container          | Role            | Image Source                                      | What It Runs                                      | Connections             | Replica Count |
| ------------------ | --------------- | ------------------------------------------------- | ------------------------------------------------- | ----------------------- | ------------- |
| `postgres`         | dependency      | `postgres:16` or `postgres:17-alpine`             | Mailmon DB                                        | api, worker             | 1             |
| `api`              | service         | existing Dockerfile or host Vitest harness        | `@mailmon/api` in local mode                      | postgres, worker        | 1             |
| `worker`           | service         | existing Dockerfile or host Vitest harness        | `@mailmon/worker` in local mode                   | postgres, gmail-sandbox | 1             |
| `gmail-sandbox`    | dependency/mock | extracted from `apps/api/src/sandbox-e2e.test.ts` | deterministic Gmail/OAuth server with fault modes | api, worker             | 1             |
| `webhook-receiver` | dependency/mock | lightweight Node HTTP server                      | generated webhook responses and timeouts          | worker                  | 1             |
| `workload`         | client          | Node/pnpm or future Antithesis workload image     | connect, sync, inject provider faults, read state | api, worker, sandbox    | 1             |

Use this for Gmail `429`, quota-style `403`, transient `503`, invalid/expired history cursor, reconnect-required, duplicate incremental dispatch, and newest-first readback.

### Local Chaos And DB Impairment

| Container   | Role       | Image Source                                  | What It Runs                                      | Connections      | Replica Count |
| ----------- | ---------- | --------------------------------------------- | ------------------------------------------------- | ---------------- | ------------- |
| `postgres`  | dependency | `postgres:16` or `postgres:17-alpine`         | Mailmon DB                                        | toxiproxy        | 1             |
| `toxiproxy` | dependency | official Toxiproxy image                      | latency/drop proxy in front of Postgres           | worker, postgres | 1             |
| `api`       | service    | existing Dockerfile                           | public API in local mode                          | worker           | 1             |
| `worker-a`  | service    | existing Dockerfile                           | worker runtime                                    | toxiproxy        | 1             |
| `worker-b`  | service    | existing Dockerfile                           | second worker for takeover after lease expiry     | toxiproxy        | 1             |
| `workload`  | client     | Node/pnpm or future Antithesis workload image | start sync, kill worker, impair DB, assert repair | api, workers     | 1             |

Use two worker containers only in the chaos lane; normal PBT should keep one worker to reduce state space.

### Deployed Transport Validation

The staging guide remains a manual topology: Cloud Run API/worker, Cloud SQL, Pub/Sub, Cloud Tasks, Google OIDC, and a public webhook receiver. Turn it into automation only after the local failure topologies are stable, because it depends on real GCP credentials and cannot be simulated entirely in CI.

## Assumptions

- Local/CI PBT is the requested deliverable; Antithesis container layout is only future context.
- DB-backed PBT should start with one Postgres instance because the system's distributed risk is mostly in application-level leasing and transport retries, not DB replication.
- Test data must be synthetic and should not use real Gmail accounts.
- GitHub Actions now caches `~/.cache/hegel` in both CI and PBT Nightly.
- Test data must stay synthetic unless a separately provisioned live Gmail sandbox tier is explicitly approved.

## Open Questions

- Should failure-injection start in local Docker Compose or staging GCP?
- If live Gmail accounts are required, who owns account lifecycle, rate-limit budgets, and cleanup?
