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
  - path: https://antithesis.com/docs/using_antithesis/sdk/define_test_properties/
    why: Test property definition and assertion cataloging context.
  - path: https://antithesis.com/docs/best_practices/optimizing/
    why: Test-environment tuning guidance.
---

# Evaluation: Coverage Balance

## Findings

- The catalog remains well balanced across mailbox sync, Gmail projection, webhook delivery, replay, worker protocol, pagination, and browser/docs surfaces.
- The implemented PBT increment covers mostly pure deterministic properties: codecs, history compaction, initial-sync merge, label normalization, webhook retry classification, terminal classification, and pagination cursors.
- The highest-risk properties are still mostly unimplemented because they require generated state-machine operations against PostgreSQL: mailbox leasing, stale commits, cursor regression at commit time, sync snapshot idempotency, webhook claim recovery, and replay overlap.
- The browser/docs property is intentionally isolated and should not compete with backend state-machine work.
- Watch renewal and credential crypto remain reasonable second-pass candidates, but they do not beat the DB-backed sync/webhook/replay cluster for first risk reduction.

## Current Coverage Map

| Status                                     | Properties                                                                                                                                                                                                         |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Implemented local Hegel                    | `history-delete-wins-compaction`, `initial-sync-catchup-delete-wins`, `webhook-retry-delay-bounded-monotonic`, `internal-worker-codecs-reject-malformed-envelopes`, `pagination-cursors-roundtrip-and-reject-junk` |
| Partially implemented local Hegel          | `label-ids-are-normalized`, `terminal-webhook-outcomes-do-not-reschedule`                                                                                                                                          |
| Existing example/integration coverage only | `thread-summary-follows-latest-message`, `gmail-push-is-wakeup-only-and-fans-out`, several mailbox sync and webhook/replay state-machine properties                                                                |
| Not implemented                            | `docs-browser-navigation-has-no-runtime-errors` and the DB-backed generated state-machine versions of the sync/webhook/replay properties                                                                           |

## Passes

- Claimed guarantees from README/PRD remain represented: single-flight, state-before-cursor, push-as-wakeup, idempotent writes, at-least-once delivery, replay, and cursor safety.
- Property count is broad enough without becoming unmaintainable.
- The first implemented increment picked good low-friction targets.

## Gaps

- Add generated PostgreSQL tests before broadening protocol fuzzing.
- Extend Gmail history PBT across multiple pages and missing-message races.
- Update `docs/testing-requirements.md` once Hegel fully replaces the old fast-check wording.

## Actions Taken

- Updated evaluation synthesis to make DB-backed state-machine PBT the next explicit implementation focus.

## Assumptions

- First implementation should target the highest-risk sync/webhook/replay paths.

## Open Questions

- None.
