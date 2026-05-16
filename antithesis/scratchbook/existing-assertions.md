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

# Existing Assertions And PBT Instrumentation

## Summary

No native Antithesis SDK assertion calls are present in this repo.

Local Hegel PBT is now present as the first backend workload increment. The current implementation adds `@hegeldev/hegel` 0.2.2 as a dev dependency in `@mailmon/core`, `@mailmon/gmail`, and `@mailmon/db`, and adds five PBT test files. No Bombadil specs are present yet.

## Native Antithesis SDK Assertions

Scan target:

```bash
rg -n "antithesis|assert_always|assert_sometimes|assert_reachable|assert_unreachable|alwaysOrUnreachable|ANTITHESIS_OUTPUT_DIR|ANTITHESIS_STOP_FAULTS" -g '!node_modules' -g '!dist' -g '!pnpm-lock.yaml' .
```

Result:

- No Antithesis SDK imports or assertion calls in SUT code.
- No `ANTITHESIS_OUTPUT_DIR` or `ANTITHESIS_STOP_FAULTS` usage in repo code.

## Local Hegel PBT

Scan target:

```bash
rg -n "@hegeldev/hegel|hegel\\.test|testLocation" -g '!node_modules' -g '!dist' -g '!pnpm-lock.yaml' .
```

Results:

| File                                                              | Current coverage                                                                                                                |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `packages/core/src/internal-message-codec.pbt.test.ts`            | Generated valid and malformed direct, Pub/Sub, dead-letter, Gmail push, webhook delivery, and control-job payloads.             |
| `packages/core/src/webhook-delivery-execution.pbt.test.ts`        | Retry-delay monotonicity, retryable response/failure pending classification, and terminal outcome no-reschedule classification. |
| `packages/gmail/src/history.pbt.test.ts`                          | Delete-wins Gmail history compaction, initial-sync catch-up delete wins, and Gmail projection label preservation.               |
| `packages/db/src/persistence/canonical-state-mappers.pbt.test.ts` | Label ID normalization across row mappers and mailbox event payloads.                                                           |
| `packages/db/src/persistence/pagination-cursors.pbt.test.ts`      | Message/thread/sync-run cursor round trips plus invalid prefix, JSON, ID, and timestamp rejection.                              |

Current Hegel coverage maps to these catalog entries:

- Implemented: `history-delete-wins-compaction`
- Implemented: `initial-sync-catchup-delete-wins`
- Implemented: `webhook-retry-delay-bounded-monotonic`
- Implemented: `internal-worker-codecs-reject-malformed-envelopes`
- Implemented: `pagination-cursors-roundtrip-and-reject-junk`
- Partially implemented: `label-ids-are-normalized`
- Partially implemented: `terminal-webhook-outcomes-do-not-reschedule`

## Bombadil

Scan target:

```bash
rg -n "@antithesishq/bombadil|bombadil" -g '!node_modules' -g '!dist' -g '!pnpm-lock.yaml' .
```

Result:

- No Bombadil dependency or spec file is present.
- Browser/docs fuzzing remains a later, separate lane.

## Legacy Roadmap Mentions

`docs/testing-requirements.md` still names future `fast-check` work for deterministic simulation. The implemented direction is now Hegel, so the roadmap should be updated when the PBT branch is finalized.

## Implication

The first local PBT increment is real and passing. The remaining gap is not more pure generator tests; it is DB-backed state-machine PBT for lease contention, stale lease commits, cursor regression at commit time, snapshot idempotency, webhook claim recovery, and replay overlap.

## Assumptions

- Generated `dist` and dependency directories are excluded from scans.
- The current Hegel files are uncommitted worktree additions at the time of this review.
- Hegel's root package exports `test` and `testAsync`; the `.testLocation(...)` builder exists in local source but is not available through the public root export in 0.2.2, so native Antithesis assertion output should not be treated as implemented.

## Open Questions

- None.
