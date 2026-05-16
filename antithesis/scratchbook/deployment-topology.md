---
sut_path: /home/satty/projects/mailmon-dev
commit: e6786833c6b30e398f8d7bf0540d1732673942c7
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
---

# Deployment Topology

## Summary

Because there is no Antithesis platform access, the useful topology is local/CI PBT. Hegel properties now run as normal Vitest suites in the package test path. Use Bombadil as an optional browser fuzzer against docs/marketing servers later. A future Antithesis topology is included only so later setup work has a concrete handoff.

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

## Bombadil Browser Topology

| Component       | Role            | Image/Source                 | What It Runs                                                                                                          | Connections | Replica Count |
| --------------- | --------------- | ---------------------------- | --------------------------------------------------------------------------------------------------------------------- | ----------- | ------------- |
| `docs-server`   | service         | host dev server              | `pnpm --filter @mailmon/docs dev`                                                                                     | browser     | 1             |
| `bombadil-docs` | client/workload | `@antithesishq/bombadil` CLI | `bombadil test http://127.0.0.1:3333 antithesis/bombadil/docs.spec.ts --headless --time-limit 2m --exit-on-violation` | docs-server | 1             |

Optional later:

- Add `apps/marketing` after it is committed and treated as supported.
- Use Bombadil default properties plus custom reachability extractors for important docs pages.

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

## Assumptions

- Local/CI PBT is the requested deliverable; Antithesis container layout is only future context.
- DB-backed PBT should start with one Postgres instance because the system's distributed risk is mostly in application-level leasing and transport retries, not DB replication.
- Test data must be synthetic and should not use real Gmail accounts.
- GitHub Actions currently caches pnpm, not Hegel's `~/.cache/hegel`; add a cache or `uv` setup step if Hegel cold starts become flaky or slow.

## Open Questions

- None.
