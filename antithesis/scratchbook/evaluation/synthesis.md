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

# Evaluation Synthesis

## Summary

The current PBT direction is sound: Hegel + Vitest is a good local substitute for the repo's original fast-check roadmap, and the first pure-property increment is passing. The catalog is still ahead of the implementation, which is expected. The main improvement is to stop spending effort on more shallow pure checks and move next into DB-backed state-machine properties.

## Current Verification

Commands run on 2026-05-17:

| Command                                                                                                                                | Result                                                         |
| -------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| `pnpm --filter @mailmon/core test -- src/internal-message-codec.pbt.test.ts src/webhook-delivery-execution.pbt.test.ts`                | Passed; Vitest ran the core package suite: 8 files, 93 tests.  |
| `pnpm --filter @mailmon/gmail test -- src/history.pbt.test.ts`                                                                         | Passed; Vitest ran the Gmail package suite: 2 files, 26 tests. |
| `pnpm --filter @mailmon/db test -- src/persistence/canonical-state-mappers.pbt.test.ts src/persistence/pagination-cursors.pbt.test.ts` | Passed; Vitest ran the DB package suite: 11 files, 51 tests.   |

## Findings And Actions

| Category   | Finding                                                                                                                                                                            | Affected Properties                                                                                                                                                                                                                                                        | Action                                                                                                                           |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Refinement | `existing-assertions.md` was stale and still said no Hegel tests existed.                                                                                                          | catalog-wide                                                                                                                                                                                                                                                               | Updated it to list the five current PBT files and distinguish native Antithesis assertions from local Hegel PBT.                 |
| Refinement | The first implemented Hegel suite is valid but intentionally pure/shallow.                                                                                                         | implemented Hegel properties                                                                                                                                                                                                                                               | Keep it in PR-time tests; add `tc.note` diagnostics and a configurable test-case count before expanding scenario size.           |
| Gap        | The highest-risk catalog entries remain DB-backed state machines.                                                                                                                  | `mailbox-lease-single-flight`, `lease-loss-prevents-stale-commit`, `cursor-never-regresses`, `state-cursor-events-commit-atomically`, `sync-snapshot-application-is-idempotent`, `webhook-claim-is-exclusive-and-stale-recoverable`, `replay-active-ranges-do-not-overlap` | Next implementation increment should use `packages/db/src/test-setup.ts` and generated operation sequences over real PostgreSQL. |
| Refinement | Hegel 0.2.2 has internal Antithesis-output support, but the root package exports only `test` and `testAsync`; `.testLocation(...)` is not publicly available from the root export. | catalog-wide future-portability notes                                                                                                                                                                                                                                      | Treat Antithesis output as future/upstream-dependent, not part of current instrumentation.                                       |
| Gap        | Gmail history PBT currently uses a single history page and all changed messages fetch successfully.                                                                                | `history-delete-wins-compaction`                                                                                                                                                                                                                                           | Add generated multi-page history and `getMessage` returning `null` for raced-away changed IDs.                                   |
| Gap        | CI runs PBT through normal package tests but does not cache or preinstall Hegel's `uv`/`hegel-core` dependency.                                                                    | topology/CI                                                                                                                                                                                                                                                                | Add a CI cache/setup step if Hegel cold starts become slow or flaky.                                                             |
| Bias       | Bombadil remains correctly low priority for this backend-heavy system.                                                                                                             | `docs-browser-navigation-has-no-runtime-errors`                                                                                                                                                                                                                            | Keep it out of the backend PBT lane until docs/browser fuzzing is explicitly in scope.                                           |

## Recommended Implementation Order

1. Add a tiny shared Hegel helper for `testCases` and failure diagnostics, then add `tc.note` to properties with generated operation sequences.
2. Add DB-backed Hegel for cursor regression and stale lease commit prevention.
3. Add DB-backed Hegel for snapshot idempotency, state/cursor/event atomicity, and thread summary recalculation after generated deletes.
4. Add DB-backed Hegel for webhook claim recovery and replay overlap conflicts.
5. Add generated multi-page Gmail history PBT.
6. Update `docs/testing-requirements.md` from fast-check to Hegel when this PBT increment is ready to land.
7. Add Bombadil only after backend PBT is stable and docs browser fuzzing is worth the CI cost.

## Assumptions

- No real Gmail credentials, GCP services, or Antithesis platform access are needed for the next PBT increment.
- PR-time PBT should stay small; nightly or manual runs can raise Hegel `testCases`.
- The current PBT files and package dependency changes are uncommitted worktree changes.

## Open Questions

- None.
