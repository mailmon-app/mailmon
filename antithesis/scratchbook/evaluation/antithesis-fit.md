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

# Evaluation: Antithesis Fit

## Findings

- High fit: `mailbox-lease-single-flight`, `lease-loss-prevents-stale-commit`, `state-cursor-events-commit-atomically`, `webhook-claim-is-exclusive-and-stale-recoverable`, and replay claim properties target timing/concurrency/failure state space.
- High local PBT fit: Gmail history, cursor, label, retry classification, codec, and pagination properties are deterministic but benefit from generated inputs and shrinking.
- Lower Antithesis fit: `docs-browser-navigation-has-no-runtime-errors` is not a backend fault property. It is still valuable with Bombadil because it explores browser states, but it should not consume backend PBT effort.
- Assertion type check: Most properties are safety invariants and correctly use `Always`. The docs property includes reachability language because important docs pages should be reached during browser exploration.

## Passes

- Catalog does not overuse `Sometimes`; liveness-style properties are not forced into Antithesis semantics.
- Properties are specific enough to fail locally under Hegel or Bombadil.

## Actions Taken

- Marked Bombadil docs property as low priority and explicitly secondary.
- Kept future Antithesis notes separate from local PBT implementation.

## Assumptions

- No platform faults are required for the first implementation.

## Open Questions

- None.
