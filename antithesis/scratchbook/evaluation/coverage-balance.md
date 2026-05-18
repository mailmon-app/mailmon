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
  - path: https://antithesis.com/docs/using_antithesis/sdk/define_test_properties/
    why: Test property definition and assertion cataloging context.
  - path: https://antithesis.com/docs/best_practices/optimizing/
    why: Test-environment tuning guidance.
  - path: /home/satty/projects/mailmon-dev/docs/testing-requirements.md
    why: Target testing requirements document for this reanalysis.
---

# Evaluation: Coverage Balance

## Findings

- The catalog remains well balanced across mailbox sync, Gmail projection, webhook delivery, replay, worker protocol, pagination, and deferred product-web-interface surfaces.
- The implemented PBT lane now covers pure deterministic properties and DB-backed state-machine properties: codecs, history compaction, initial-sync merge, label normalization, webhook retry classification, terminal classification, pagination cursors, mailbox leasing, stale commits, cursor regression, sync snapshot idempotency, webhook claim recovery, and replay overlap.
- The highest-risk gaps have moved up a level into provider-failure E2E, process/DB fault injection, deployed Pub/Sub retry behavior, and load/backpressure.
- The product-web-interface property is intentionally deferred and should not compete with backend state-machine work.
- Watch renewal and credential crypto remain reasonable second-pass candidates, but they do not beat the DB-backed sync/webhook/replay cluster for first risk reduction.

## Current Coverage Map

| Status                                     | Properties                                                                                                                                                 |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Implemented local Hegel                    | All backend catalog properties in the mailbox sync, Gmail projection, webhook/replay, worker protocol, and pagination clusters have Hegel/Vitest coverage. |
| Existing example/integration coverage only | Provider-failure E2E through real runtime composition, deployed Pub/Sub retry/dead-letter behavior, and staging/live Gmail validation.                     |
| Not implemented/deferred                   | `product-web-interface-has-no-runtime-errors`, worker-death chaos, PostgreSQL impairment, and repeatable load/backpressure budgets.                        |

## Passes

- Claimed guarantees from README/PRD remain represented: single-flight, state-before-cursor, push-as-wakeup, idempotent writes, at-least-once delivery, replay, and cursor safety.
- Property count is broad enough without becoming unmaintainable.
- The first implemented increment picked good low-friction targets.

## Gaps

- Add provider-failure E2E before broadening pure generator coverage.
- Add worker-death and PostgreSQL impairment harnesses.
- Add repeatable load budgets for internal routes.

## Actions Taken

- Updated evaluation synthesis to make failure-injection and operations testing the next explicit implementation focus.

## Assumptions

- First implementation should target the highest-risk operations paths from `docs/testing-requirements.md`.

## Open Questions

- None.

## 2026-05-17 Testing Requirements Reanalysis

The old "DB-backed properties are mostly unimplemented" finding is stale. The PBT-only config now runs 11 PBT files, and the testing requirements identify higher-level gaps: provider-failure E2E, worker death, PostgreSQL impairment, deployed Pub/Sub retries, and load/performance budgets. The catalog now has a new Failure Injection And Operations category for those gaps.
