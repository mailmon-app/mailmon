---
sut_path: /home/satty/projects/mailmon-dev
commit: 8f544ea13a0afb0b16f13e221dca8e20f4e989ab
updated: 2026-05-17
external_references:
  - path: https://github.com/hegeldev/hegel-typescript
    why: Earlier research source for local TypeScript PBT direction.
  - path: https://antithesis.com/docs/properties_assertions/assertions/
    why: Assertion taxonomy used to classify future native Antithesis properties.
  - path: https://antithesis.com/docs/using_antithesis/sdk/define_test_properties/
    why: Test property and assertion cataloging context.
  - path: /home/satty/projects/mailmon-dev/docs/testing-requirements.md
    why: Target testing requirements document for this reanalysis.
  - path: /home/satty/projects/mailmon-dev/plans/antithesis-pbt-implementation-plan.md
    why: Historical plan checked against current implemented PBT files.
---

# Existing Assertions And PBT Instrumentation

## Summary

No native Antithesis SDK assertions are present in SUT code. Antithesis remains vocabulary and future portability only.

Local Hegel PBT is now substantial and covers 11 PBT files across `@mailmon/core`, `@mailmon/gmail`, and `@mailmon/db`. The remaining requirements in `docs/testing-requirements.md` are not primarily more local Hegel properties; they are provider-failure E2E, process/DB fault injection, deployed Pub/Sub retry validation, and load/performance budgets.

## Native Antithesis SDK Assertions

Scan target:

```bash
rg -n "antithesis|assert_always|assert_sometimes|assert_reachable|assert_unreachable|alwaysOrUnreachable|ANTITHESIS_OUTPUT_DIR|ANTITHESIS_STOP_FAULTS" apps packages scripts infra docs plans .github -g '!node_modules/**' -g '!dist/**' -g '!coverage/**' -g '!pnpm-lock.yaml'
```

Result:

- No Antithesis SDK imports or assertion calls in `apps/` or `packages/`.
- No `ANTITHESIS_OUTPUT_DIR` or `ANTITHESIS_STOP_FAULTS` usage in SUT code.
- Mentions are limited to docs/plans/scratchbook guidance warning not to claim native Antithesis support.

## Local Hegel PBT

Current PBT files:

| File                                                              | Current coverage                                                                                                                                         |
| ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/core/src/gmail-push-notification.pbt.test.ts`           | Gmail push fanout and wake-up-only semantics.                                                                                                            |
| `packages/core/src/internal-message-codec.pbt.test.ts`            | Generated valid and malformed direct, Pub/Sub, dead-letter, Gmail push, webhook delivery, and control-job payloads.                                      |
| `packages/core/src/mailbox-sync-execution.pbt.test.ts`            | Core mailbox sync single-flight/service-boundary execution properties.                                                                                   |
| `packages/core/src/webhook-delivery-execution.pbt.test.ts`        | Retry-delay monotonicity, retryable response/failure pending classification, and terminal no-reschedule classification.                                  |
| `packages/gmail/src/history.pbt.test.ts`                          | Multi-page Gmail history, initial-sync catch-up, delete-wins compaction, and disappeared changed messages.                                               |
| `packages/db/src/mailbox-sync-commit.pbt.test.ts`                 | Cursor regression rejection, stale lease no-op commits, atomic sync commit, idempotent snapshots, label normalization, and thread summary recalculation. |
| `packages/db/src/mailbox-sync-execution.pbt.test.ts`              | DB-backed lease acquisition and sync execution single-flight properties.                                                                                 |
| `packages/db/src/replay.pbt.test.ts`                              | Replay overlap conflict handling, single-claim dispatch, and event counting.                                                                             |
| `packages/db/src/webhook-delivery-runtime.pbt.test.ts`            | Stable delivery IDs, exclusive/stale claims, terminal no-reschedule behavior, and delivery runtime state.                                                |
| `packages/db/src/persistence/canonical-state-mappers.pbt.test.ts` | Canonical mapper label normalization.                                                                                                                    |
| `packages/db/src/persistence/pagination-cursors.pbt.test.ts`      | Message/thread/sync-run cursor round trips and invalid cursor rejection.                                                                                 |

The PBT-only command is:

```bash
PBT_TEST_CASES=<n> pnpm exec vitest run --config vitest.pbt.config.ts
```

`pnpm test:pbt` is broader: it filters package tests for `@mailmon/core`, `@mailmon/gmail`, and `@mailmon/db`, so it includes non-PBT tests too.

## Bombadil

No Bombadil dependency or spec file is present. Bombadil is deferred until a product web interface exists; docs and marketing should not get a Bombadil lane in this roadmap.

## Implication

The scratchbook should no longer describe DB-backed state-machine PBT as the main missing implementation. The next missing testing requirements are:

- provider-failure E2E through real API/worker runtimes
- worker death and lease takeover
- PostgreSQL latency/drop fault injection
- deployed Pub/Sub retry/dead-letter validation
- load scenarios and pass/fail budgets

## Assumptions

- Generated `dist`, dependency, and coverage directories are excluded from scans.
- Native Antithesis SDK assertions are still absent by design.
- Hegel's local Vitest lane remains the executable substitute until native platform access and SDK plumbing exist.

## Open Questions

- None.
