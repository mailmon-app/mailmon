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

# Evaluation: Wildcard

## Findings

- The user's explicit "no Antithesis platform access" changes the center of gravity: build useful local properties now, but keep names and messages compatible with future Antithesis cataloging.
- Hegel's dependency on a Python `hegel-core` server via `uv` may affect CI cold-start time. The first implementation should cache `~/.cache/hegel` or pin a setup step.
- Bombadil is tempting because it is from Antithesis, but for this repo it should not distract from backend properties. Most business risk is not browser UI.
- `apps/marketing` is untracked in the current worktree. Do not build core testing strategy around it yet.

## Passes

- Scratchbook explicitly states local/CI first and avoids platform-only commands.
- The property set aligns with product language rather than with tool novelty.

## Actions Taken

- Added assumptions about Hegel/Bombadil dependency timing.
- Scoped Bombadil to docs and optional marketing only.

## Assumptions

- CI can install `uv` or allow Hegel to download a private copy during first run.

## Open Questions

- None.
