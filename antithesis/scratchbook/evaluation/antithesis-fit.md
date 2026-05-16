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

# Evaluation: Antithesis Fit

## Findings

- High Antithesis/fault fit remains concentrated in `mailbox-lease-single-flight`, `lease-loss-prevents-stale-commit`, `state-cursor-events-commit-atomically`, `webhook-claim-is-exclusive-and-stale-recoverable`, and replay claim/overlap properties.
- Current Hegel tests are good local PBT, but most are not Antithesis sweet-spot properties. They are deterministic generator checks that benefit from shrinking, not from fault injection.
- This is acceptable for the first increment because the user does not have Antithesis platform access. The next step should still move toward generated interleavings and partial-failure analogues in real PostgreSQL.
- Assertion type check still looks sane: implemented backend properties are safety invariants and fit `Always` semantics. Browser/docs remains low-priority safety/reachability.
- Hegel 0.2.2 should not be described as providing implemented Antithesis assertion cataloging in this repo; the public root export does not expose `.testLocation(...)`.

## Passes

- The catalog does not overuse `Sometimes`; liveness/reachability language is kept to browser/docs and future guidance.
- Properties are specific enough to fail locally under Hegel or Bombadil.
- The current PBT suite aligns with the "properties as assertions" guidance from Antithesis docs even though local assertions are Vitest expectations.

## Refinements

- Keep Antithesis assertion labels as semantic vocabulary only until native SDK/assertion output is actually wired.
- Prefer DB-backed generated state machines over additional pure unit-like generator checks for the next increment.

## Actions Taken

- Updated synthesis and existing instrumentation notes to separate local Hegel PBT from native Antithesis SDK assertions.

## Assumptions

- No platform faults are required for current local PBT.

## Open Questions

- None.
