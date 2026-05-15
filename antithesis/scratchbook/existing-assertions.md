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

# Existing Assertions

## Summary

No existing Antithesis SDK assertions, Hegel tests, or Bombadil specs were found in this repo.

The only PBT-related mention in the repo is a roadmap item in `docs/testing-requirements.md` recommending fast-check-driven deterministic simulation tests. No `fast-check` dependency or test implementation is present.

## Scan

Command used:

```bash
rg -n "antithesis|assert_always|assert_sometimes|assert_reachable|assert_unreachable|alwaysOrUnreachable|ANTITHESIS_OUTPUT_DIR|ANTITHESIS_STOP_FAULTS|@hegeldev/hegel|@antithesishq/bombadil|fast-check|fc\\." -g '!node_modules' -g '!dist' -g '!pnpm-lock.yaml' .
```

Result:

- `docs/testing-requirements.md` mentions future `fast-check` work.
- No Antithesis SDK imports or assertion calls.
- No Hegel imports.
- No Bombadil imports or spec files.

## Implication

All suggested instrumentation and PBT properties in this scratchbook are missing today. Hegel should be the first implementation step because it fits existing Vitest workflows and the highest-value backend properties. Bombadil should be introduced as a separate browser fuzzing lane.

## Assumptions

- Generated `dist` and dependency directories are excluded from this scan.
- The untracked `apps/marketing` directory is not considered existing PBT instrumentation.

## Open Questions

- None.
