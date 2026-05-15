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

# Evaluation: Implementability

## Findings

- Hegel integrates with the repo's existing Vitest setup. Async Effect programs can be checked with `hegel.testAsync`.
- DB-backed properties can reuse existing isolated database helpers in `packages/db/src/test-setup.ts`.
- Some useful helper functions are private (`compactGmailHistoryRecords`, cursor helpers, pagination helpers). Properties can test through public behavior or implementation can export test-only helpers from persistence modules if the repo accepts that pattern.
- Hegel currently emits a single Antithesis-style `Always` aggregate per `.testLocation(...)`; local PBT should rely on precise Vitest test names and thrown failure messages, not on multiple Antithesis assertion types.
- Bombadil requires a running docs/marketing server and browser environment. Keep it outside the backend PBT command path until stable.

## Passes

- Every cataloged property has an observable local check path.
- No property requires real Gmail, GCP Pub/Sub, Cloud Tasks, or Antithesis platform access.

## Actions Taken

- Deployment topology separates pure, DB-backed, E2E, and Bombadil lanes.
- Catalog entries call out Hegel or Bombadil implementation shape.

## Assumptions

- Adding dev dependencies is deferred until implementation.

## Open Questions

- None.
