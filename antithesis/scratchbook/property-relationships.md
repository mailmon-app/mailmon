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

# Property Relationships

## Summary

The properties cluster around four implementation areas: mailbox sync execution, Gmail projection, webhook/replay durability, and protocol/read surfaces. The first implemented Hegel increment covers mostly Gmail projection, protocol/read surfaces, and webhook retry classification; mailbox sync execution and DB-backed webhook/replay durability remain the next highest-value clusters. The deferred Bombadil property is intentionally separate because it would test a future product web interface rather than backend state correctness.

## Cluster: Mailbox Execution Safety

Properties:

- `mailbox-lease-single-flight`
- `lease-loss-prevents-stale-commit`
- `cursor-never-regresses`
- `state-cursor-events-commit-atomically`
- `sync-snapshot-application-is-idempotent`

Notes:

- `lease-loss-prevents-stale-commit` is a lower-level guard that supports `mailbox-lease-single-flight`.
- `state-cursor-events-commit-atomically` depends on the DB transaction boundary and should be tested with real PostgreSQL.
- `cursor-never-regresses` is independent enough to keep as a pure/DB hybrid property; it catches bad generated provider cursors even when leasing works.

## Cluster: Gmail Projection Correctness

Properties:

- `history-delete-wins-compaction`
- `initial-sync-catchup-delete-wins`
- `thread-summary-follows-latest-message`
- `label-ids-are-normalized`

Notes:

- Delete-wins properties target provider delta interpretation before persistence.
- `thread-summary-follows-latest-message` crosses projection and DB commit recalculation.
- `label-ids-are-normalized` reduces false update/event emissions in `sync-snapshot-application-is-idempotent`.

## Cluster: Webhook And Replay Durability

Properties:

- `webhook-delivery-id-stable-dedupes-scheduling`
- `webhook-claim-is-exclusive-and-stale-recoverable`
- `webhook-retry-delay-bounded-monotonic`
- `terminal-webhook-outcomes-do-not-reschedule`
- `replay-active-ranges-do-not-overlap`
- `replay-dispatch-is-single-claim-and-counted`

Notes:

- Stable delivery IDs dominate duplicate scheduling risk.
- Claim exclusivity and retry scheduling combine into the main at-least-once delivery state machine.
- Replay properties share the webhook delivery store, because replay creates the same durable delivery records as live events.

## Cluster: Protocol And Read Surface

Properties:

- `internal-worker-codecs-reject-malformed-envelopes`
- `gmail-push-is-wakeup-only-and-fans-out`
- `pagination-cursors-roundtrip-and-reject-junk`

Notes:

- Worker codecs protect the async transport boundary.
- Gmail push fanout depends on the push notification store and dispatcher; it should remain state-free.
- Pagination cursor PBT protects public read correctness after state mutations created by sync properties.

## Cluster: Deferred Product Web Interface

Properties:

- `product-web-interface-has-no-runtime-errors`

Notes:

- This is intentionally isolated from backend correctness.
- Bombadil should not target docs or marketing in this roadmap.
- Revisit only when a real product web interface exists.

## Cluster: Failure Injection And Operations

Properties:

- `provider-failure-e2e-preserves-operational-state`
- `worker-death-lease-expiry-takeover`
- `postgres-impairment-does-not-partially-commit`
- `deployed-pubsub-retries-redispatch-sync`
- `internal-route-load-maintains-backpressure`

Notes:

- These are the main gaps from `docs/testing-requirements.md`.
- `worker-death-lease-expiry-takeover` depends on `lease-loss-prevents-stale-commit`, but adds process death and takeover liveness.
- `postgres-impairment-does-not-partially-commit` depends on `state-cursor-events-commit-atomically`, but adds latency/drop faults rather than generated DB states.
- `deployed-pubsub-retries-redispatch-sync` is not covered by local worker codec PBT because it needs deployed Pub/Sub retry/dead-letter semantics.
- `internal-route-load-maintains-backpressure` can reveal resource exhaustion that functional properties miss.

## Assumptions

- No property is invalidated by current code inspection.
- The DB-backed cluster is now largely implemented locally; the next highest production risk is failure injection around deployed async transport and DB/process impairment.

## Open Questions

- The failure-injection cluster needs a topology decision before implementation: local Docker fault harness, staging GCP validation, or future native Antithesis.
