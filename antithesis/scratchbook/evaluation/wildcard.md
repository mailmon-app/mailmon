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

# Evaluation: Wildcard

## Findings

- The current PBT suite is better than the old roadmap because it is already wired into the package test path and uses a real shrinking engine. Do not switch back to fast-check unless Hegel becomes operationally painful.
- The biggest hidden risk is not missing generator variety; it is false confidence from pure properties while the actual product risk lives in DB-backed commit and claim boundaries.
- CI may pay a cold-start cost because Hegel uses `uv` and a Python `hegel-core` component. The GitHub Actions workflow caches pnpm but not Hegel's own cache.
- Current tests do not use `tc.note`, which means a failing shrunk case may not include enough final-replay context for generated operation sequences.
- `docs/testing-requirements.md` still names fast-check. That should be updated when this branch is ready so the repo does not carry two competing PBT directions.
- Bombadil remains tempting because it is Antithesis-adjacent, but it is still the wrong next investment for a backend state-sync product.

## Passes

- The scratchbook explicitly states local/CI first and avoids platform-only commands.
- The property set aligns with Mailmon product language rather than with tool novelty.
- Current PBT tests pass under the normal package test commands.

## Wildcard Next Checks

- Add one deliberately failing local experiment while developing the DB-backed generator helper to verify Hegel shrink output is readable for multi-step state machines.
- Keep generated DB scenarios small enough to shrink; use operation sequences and a model, not arbitrary async loops.
- Consider a `PBT_TEST_CASES` environment override before adding nightly counts.

## Actions Taken

- Updated synthesis to call out Hegel cache/setup and failure diagnostics.
- Updated instrumentation notes to avoid overstating Antithesis output support.

## Assumptions

- CI can install `uv` or allow Hegel to download a private copy during first run.

## Open Questions

- None.
