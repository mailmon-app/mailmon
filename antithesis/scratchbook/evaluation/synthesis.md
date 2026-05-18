---
sut_path: /home/satty/projects/mailmon-dev
commit: 8f544ea13a0afb0b16f13e221dca8e20f4e989ab
updated: 2026-05-17
external_references:
  - path: https://antithesis.com/docs/properties_assertions/assertions/
    why: Assertion taxonomy used to classify properties.
  - path: https://antithesis.com/docs/using_antithesis/sdk/define_test_properties/
    why: Test property and assertion cataloging context.
  - path: https://antithesis.com/docs/best_practices/optimizing/
    why: Test-environment tuning guidance.
  - path: /home/satty/projects/mailmon-dev/docs/testing-requirements.md
    why: Target testing requirements document for this reanalysis.
  - path: /home/satty/projects/mailmon-dev/docs/launch-readiness.md
    why: Cross-check for current launch and verification claims.
  - path: /home/satty/projects/mailmon-dev/docs/staging-validation-guide.md
    why: Manual live validation scope for Cloud Tasks and Gmail push/watch production paths.
  - path: /home/satty/projects/mailmon-dev/plans/antithesis-pbt-implementation-plan.md
    why: Historical implementation plan used to identify what is now complete versus stale.
  - path: /home/satty/projects/mailmon-dev/plans/clouldflare-findings.md
    why: Independent plan noting chaos/load baselining as migration prerequisites.
---

# Evaluation Synthesis

## Summary

`docs/testing-requirements.md` is now aligned with the current codebase: local Hegel PBT is implemented and the main remaining confidence gaps are failure-injection and operations testing. The property catalog needed a gap-filling pass, not a rewrite.

This pass added five operations/failure properties:

- `provider-failure-e2e-preserves-operational-state`
- `worker-death-lease-expiry-takeover`
- `postgres-impairment-does-not-partially-commit`
- `deployed-pubsub-retries-redispatch-sync`
- `internal-route-load-maintains-backpressure`

## Current Verification

Commands run immediately before this research update:

| Command                                                                              | Result                                                                                        |
| ------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------- |
| `pnpm test:coverage`                                                                 | Passed: 28 test files, 265 tests; coverage above configured thresholds.                       |
| `PBT_TEST_CASES=5 pnpm exec vitest run --config vitest.pbt.config.ts --reporter=dot` | Passed: 11 PBT files, 32 tests.                                                               |
| `snouty docs show properties_assertions/assertions`                                  | Retrieved assertion taxonomy: Always, AlwaysOrUnreachable, Reachable, Unreachable, Sometimes. |
| `snouty docs show using_antithesis/sdk/define_test_properties`                       | Retrieved SDK property-definition guidance and assertion cataloging note.                     |
| `snouty docs show best_practices/optimizing`                                         | Retrieved guidance on test-specific tuning, smaller data volumes, and simulation efficiency.  |

## Findings And Actions

| Category   | Finding                                                                                                                               | Affected Properties                                | Action                                                                                                          |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Refinement | The old scratchbook still framed DB-backed PBT as the main missing work, but those PBT files now exist and pass in the PBT-only lane. | catalog-wide                                       | Updated `sut-analysis.md`, `existing-assertions.md`, and the catalog summary to reflect current Hegel coverage. |
| Gap        | Provider failures are covered in lower-level tests but not through the real API/worker/Gmail sandbox composition.                     | `provider-failure-e2e-preserves-operational-state` | Added a high-priority E2E property and evidence file.                                                           |
| Gap        | Worker death and takeover is not covered by service-model PBT or normal DB tests.                                                     | `worker-death-lease-expiry-takeover`               | Added a high-priority chaos property; marked test lease/heartbeat tuning as human input.                        |
| Gap        | DB-backed PBT proves transaction invariants under normal DB behavior but not latency, connection drops, or pool impairment.           | `postgres-impairment-does-not-partially-commit`    | Added a high-priority DB impairment property and topology notes.                                                |
| Gap        | Pub/Sub retry/dead-letter behavior is manually validated in staging docs but not automated.                                           | `deployed-pubsub-retries-redispatch-sync`          | Added a high-priority deployed transport property; marked staging quota/cleanup ownership as human input.       |
| Gap        | Load testing has no repeatable workload or numeric budgets.                                                                           | `internal-route-load-maintains-backpressure`       | Added a medium-priority load/backpressure property; marked latency/pool/error budgets as human input.           |
| Bias       | Bombadil remains deferred until a product web interface exists; docs and marketing are not targets for this roadmap.                  | `product-web-interface-has-no-runtime-errors`      | Left it separate from backend fault work and marked it as future product-UI scope.                              |

## Recommended Execution Order

1. Extract the local Gmail sandbox into reusable helpers and add provider-failure E2E cases.
2. Add a local chaos harness for worker death plus shortened test-only lease timings.
3. Add DB impairment with Toxiproxy or an equivalent fault proxy.
4. Automate a staging-safe Pub/Sub retry/dead-letter validation only after cleanup/quota ownership is decided.
5. Add load scenarios once pass/fail budgets exist.

## Biases Requiring Human Judgment

- Decide whether the heavier sandbox/provider-failure matrix remains in PR-time coverage or moves to nightly/release validation.
- Decide where the first chaos tier should run: local Docker fault harness, staging GCP, or future Antithesis.
- Decide beta pass/fail budgets for internal route load.
- Decide ownership for live Gmail/staging account lifecycle if live external sandbox validation is required.

## Assumptions

- Current analysis was scoped to local `docs/` and `plans/` references per the user's answer.
- Native Antithesis platform access is still unavailable.
- Hegel remains the executable PBT lane; Antithesis assertion names are semantic/future-portability labels.

## Open Questions

- None beyond the human-judgment items listed above.
