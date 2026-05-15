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

# Evaluation Synthesis

## Summary

The catalog is implementable without Antithesis access. The strongest first PBT increment is Hegel + Vitest over `@mailmon/core`, `@mailmon/gmail`, and `@mailmon/db`. Bombadil should be added only after backend PBT is underway, and only for docs/browser properties.

## Findings And Actions

| Category   | Finding                                                                      | Affected Properties                                                                                                                           | Action                                                                                                            |
| ---------- | ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Refinement | Bombadil is not the main backend PBT tool for this repo.                     | `docs-browser-navigation-has-no-runtime-errors`                                                                                               | Marked low priority and isolated in topology.                                                                     |
| Gap        | Protocol/read surfaces were initially easy to underweight.                   | `internal-worker-codecs-reject-malformed-envelopes`, `gmail-push-is-wakeup-only-and-fans-out`, `pagination-cursors-roundtrip-and-reject-junk` | Added these properties and evidence files.                                                                        |
| Refinement | Future Antithesis assertion semantics should not block local implementation. | catalog-wide                                                                                                                                  | Described Hegel/Bombadil local checks and kept assertion types as semantic labels.                                |
| Bias       | Watch renewal and credential crypto are not first-pass PBT focus.            | catalog-wide                                                                                                                                  | Accepted for this research pass because existing tests cover examples and core risk is sync/webhook/replay state. |

## Recommended Implementation Order

1. Add Hegel dev dependency and a small pure PBT suite for Gmail projection, webhook retry classification, codecs, and pagination.
2. Add DB-backed Hegel generators for mailbox sync commit, lease loss, idempotent snapshots, webhook delivery claiming, and replay overlap.
3. Add nightly-only E2E generated scenarios around sandbox Gmail, API, worker, and webhook receiver.
4. Add Bombadil docs spec after the docs server command is stable in CI.

## Assumptions

- No real Gmail credentials, GCP services, or Antithesis platform access are needed.
- PR-time PBT should use small `testCases`; nightly PBT can raise counts and include DB/E2E lanes.

## Open Questions

- None.
