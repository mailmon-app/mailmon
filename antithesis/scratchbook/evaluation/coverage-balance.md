---
sut_path: /home/satty/projects/mailmon-dev
commit: a4771cd562e5e48b412528096145a598a04de828
updated: 2026-05-16
external_references:
  - path: https://github.com/hegeldev/hegel-typescript
    why: User-requested TypeScript property-based testing client; inspected README and source at e58959ae567cf49aaddabe2e04a5819c8e6f6850.
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

# Evaluation: Coverage Balance

## Findings

- Mailbox sync, cursor, state/event atomicity, Gmail history, webhook delivery, replay, worker protocol, pagination, and docs/browser surfaces are represented.
- Initial draft risk would have over-focused on DB commits and under-covered worker codecs and public read pagination. The final catalog includes `internal-worker-codecs-reject-malformed-envelopes`, `gmail-push-is-wakeup-only-and-fans-out`, and `pagination-cursors-roundtrip-and-reject-junk`.
- Security-sensitive credential encryption has strong example tests and is less PBT central than sync/webhook state machines. It can be added later as a separate crypto-envelope property if desired.
- Watch renewal and repair are covered indirectly by operational state and recovery concerns but do not have a dedicated property in this pass.

## Passes

- Claimed guarantees from README/PRD are represented: single-flight, state-before-cursor, push-as-wakeup, idempotent writes, at-least-once delivery, replay.
- Property count is broad enough without becoming unmaintainable.

## Actions Taken

- Added protocol/read-surface properties to balance the DB-heavy backend set.
- Left watch renewal as a follow-up rather than forcing a weak property.

## Assumptions

- First implementation should target the highest-risk sync/webhook/replay paths.

## Open Questions

- None.
