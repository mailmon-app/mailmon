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

# Evaluation: Implementability

## Findings

- Hegel is already integrated with the repo's existing Vitest setup in `@mailmon/core`, `@mailmon/gmail`, and `@mailmon/db`.
- The current PBT files are implementable and passing in normal package tests.
- DB-backed properties can reuse `withIsolatedDatabaseEffect` and `withIsolatedDatabasePromise` from `packages/db/src/test-setup.ts`.
- Effect-backed generated scenarios should keep using `@effect/vitest` for scoped resources, layers, and better fiber failure reporting.
- Hegel's root package exports `test` and `testAsync`; local source has an internal `Hegel.testLocation(...)` path for Antithesis output, but that builder is not exported by the package root in 0.2.2. Current tests should not claim native Antithesis assertion cataloging.
- Hegel defaults to 100 cases, derandomizes in CI, and disables its database in CI. The current tests override to 40 cases, which is reasonable for PR time but should be configurable for nightly/manual runs.
- Hegel `tc.note(...)` only prints on final replay. The current PBT tests do not use it, so shrunk failures involving operation sequences will be harder to inspect than necessary.
- Bombadil still requires a running docs/marketing server and browser environment. It should remain outside the backend PBT command path.

## Passes

- Every implemented PBT file has a clean local execution path.
- No implemented property requires real Gmail, GCP Pub/Sub, Cloud Tasks, or Antithesis platform access.
- Current generated inputs are bounded, so failures should shrink quickly.

## Gaps

- Add a shared local helper for Hegel settings so PR and nightly counts do not require editing every file.
- Add `tc.note` to Gmail history operations, cursor payload mutation families, codec payload families, and future DB operation sequences.
- Add DB-backed properties before adding more browser or pure protocol checks.
- Consider caching Hegel's `~/.cache/hegel` or preinstalling `uv` in CI if cold starts become a reliability problem.

## Actions Taken

- Updated `existing-assertions.md` to reflect current Hegel PBT.
- Updated synthesis to separate implemented local PBT from future Antithesis assertion output.

## Assumptions

- The current Hegel package version remains 0.2.2.
- CI should continue running PBT through the normal package test scripts unless DB-backed generation becomes too slow for PR time.

## Open Questions

- None.
