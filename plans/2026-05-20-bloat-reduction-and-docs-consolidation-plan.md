# Mailmon Bloat Reduction And Docs Consolidation Plan

Date: 2026-05-20

## Goal

Cut repository bloat without weakening Mailmon's active runtime guarantees:

- keep the current local and GCP async transport paths
- remove the legacy BullMQ/Redis transport path
- remove the legacy Fern SDK path and stale SDK customization scripts
- reduce generated SDK noise that currently pollutes dead-code and health reports
- separate durable docs from historical plans and implementation logs
- add guardrails so local binaries, copied vendor docs, and Terraform state do not drift into the repo

This plan intentionally stops at removal and reorganization. It does not propose new domain interfaces.

## Evidence Collected

Commands used:

- `pnpm exec fallow`
- `rg` for `bullmq`, `legacy_bullmq`, `sdks/typescript`, `typescript-new`, `fern`, `apply-sdk-customizations`, load scripts, and staging scripts
- `git ls-files` across docs, plans, logs, SDKs, scripts, and generated outputs
- `pnpm why bullmq --recursive`
- `pnpm why ioredis --recursive`
- `pnpm list -r --depth -1`

Important findings:

- `pnpm exec fallow` reports two unused files:
  - `scripts/apply-sdk-customizations.mjs`
  - `sdks/typescript-new/examples/mailboxesCreateConnectSession.example.ts`
- The same Fallow run reports one unlisted dependency: `dotenv`, imported only by the generated Speakeasy example.
- Fallow's top refactoring targets are mostly generated Speakeasy SDK files under `sdks/typescript-new/src`. Those should not be hand-refactored; the scanner should stop treating generated SDK internals as product-maintained architecture debt.
- `bullmq` is a direct dependency of `@mailmon/worker` only. `pnpm why bullmq --recursive` shows no other owner.
- `ioredis` is pulled by both BullMQ and `@effect/platform-node`, so removing BullMQ removes the BullMQ dependency but may not remove every Redis-related transitive package while the CLI still uses `@effect/platform-node`.
- The active publishable SDK is `sdks/typescript-new` with package name `@mailmon.dev/sdk`.
- The old Fern SDK is still tracked as `sdks/typescript` with 358 files and package name `@mailmon.dev/sdk-fern-legacy`.
- The active Speakeasy SDK has 192 tracked files, but the directory name `typescript-new` is now stale and creates confusion.
- `fern/` still contains Fern generator config targeting `../sdks/typescript`.
- `scripts/apply-sdk-customizations.mjs` patches the old Fern SDK and is unreachable from package scripts.
- `scripts/generate-sdk-for-release.mjs` is active via `pnpm sdk:generate:release`.
- `scripts/staging-pubsub-retry-smoke.ts` is active via `docs/staging-validation-guide.md`.
- `scripts/run-load-smoke.sh` is active via `load/README.md` and `docs/testing-requirements.md`.
- Docs/history volume is high: tracked markdown across README, docs, plans, logs, Antithesis scratchbook, and app docs is about 14k lines.
- `docs/plans/` and root `plans/` both contain plans, while root `logs/` contains implementation logs. This makes it hard to tell what is active.
- Local untracked bloat exists:
  - `cloud-sql-proxy`
  - `fern-docs.txt`
  - `experiment/index.html`
  - `infra/.state.json`
- `infra/.state.json` is sensitive local infrastructure state and must not be committed or quoted. If it has ever been shared outside the local machine, rotate affected secrets.

## Keep List

Do not remove these during the bloat pass:

- `@mailmon/queue`: despite the name, this is the active async transport adapter module for local HTTP dispatch, Pub/Sub sync dispatch, Cloud Tasks scheduling, and control-job dispatch.
- `scripts/generate-sdk-for-release.mjs`: active release flow.
- `scripts/staging-pubsub-retry-smoke.ts`: active staging validation tool.
- `scripts/run-load-smoke.sh` and `load/`: active report-only load smoke lane.
- `antithesis/scratchbook/`: useful property catalog and testing-roadmap context, but it should be reclassified as testing research or archived reference rather than mixed with active product docs.
- `apps/docs/`: public Mintlify docs app, separate from internal repo docs.
- `apps/marketing/`: product marketing app, separate from internal docs cleanup.

## Phase 0: Safety Baseline

Completed on 2026-05-20 on branch `cleanup-bloat`.

1. Create a cleanup branch.
2. Run `git status --short` and preserve any user-owned untracked or modified files unless explicitly deleting local-only workspace clutter.
3. Because this cleanup touches Effect config and layers, consult Effect guidance before implementation:
   - `pnpm exec effect-solutions list`
   - `pnpm exec effect-solutions show config services-and-layers testing`
4. Capture the baseline:
   - `pnpm exec fallow`
   - `pnpm build`
   - `pnpm lint`
   - `pnpm typecheck`
   - `pnpm test`
   - `pnpm format:check`
5. Add temporary grep checks to the implementation checklist:
   - `rg "legacy_bullmq|bullmq|REDIS_URL"`
   - `rg "sdks/typescript-new|sdks/typescript|Fern|fern"`
   - `rg "apply-sdk-customizations"`

Baseline snapshot:

- `git status --short` showed local-only untracked workspace clutter:
  - `cloud-sql-proxy`
  - `experiment/`
  - `fern-docs.txt`
  - `infra/.state.json`
- `pnpm exec fallow` completed and still reports the expected pre-cleanup issues:
  - unused files: `scripts/apply-sdk-customizations.mjs` and `sdks/typescript-new/examples/mailboxesCreateConnectSession.example.ts`
  - unlisted dependency: `dotenv`
  - generated SDK internals remain the dominant refactoring targets
- `pnpm build`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm format:check` all passed on the current workspace state.
- Temporary grep checks still return active references that Phase 1 through Phase 4 will remove or archive:
  - `legacy_bullmq|bullmq|REDIS_URL`
  - `sdks/typescript-new|sdks/typescript|Fern|fern`
  - `apply-sdk-customizations`

## Phase 1: Remove Legacy BullMQ Transport

Decision: Mailmon has two active async transport modes: `local` and `gcp`. The `legacy_bullmq` mode fails the deletion test. It keeps a Redis-only worker branch, config fields, tests, docs, and a direct dependency alive, while the API rejects it and current docs describe local/GCP as the real runtime model.

Files to change:

- `packages/config/src/index.ts`
  - Change `AsyncTransportMode` from `"local" | "gcp" | "legacy_bullmq"` to `"local" | "gcp"`.
  - Remove `loadRedisUrl`.
  - Remove `redisUrl` from `WorkerEnv`.
  - Remove legacy mode from `loadAsyncTransportMode`.
- `packages/config/src/index.test.ts`
  - Delete the "supports legacy bullmq mode when redis is configured" case.
  - Add or keep a negative test proving unknown transport modes fail config loading.
- `apps/worker/src/index.ts`
  - Remove `WorkerRuntimeHandle.kind = "legacy_bullmq"`.
  - Delete `startLegacyBullmqWorkerRuntime`.
  - Delete dynamic imports of `bullmq` and `createRedisConnectionOptions`.
  - Make `startWorkerRuntime` always start the HTTP worker runtime.
- `apps/worker/src/runtime.ts`
  - Remove the `legacy_bullmq` case from `createMailboxSyncDispatcherLayer`.
- `apps/worker/src/index.test.ts`
  - Delete the Redis-required test.
  - Keep startup tests focused on local and GCP runtime behavior.
- `apps/worker/src/processor.ts`
  - Change `WorkerTransportMode` to `"gcp" | "local"`.
  - Remove legacy mode from log/error metadata expectations if present.
- `apps/worker/package.json`
  - Remove `"bullmq"`.
- `packages/queue/src/index.ts`
  - Delete `SYNC_MAILBOX_QUEUE` if no longer used.
  - Delete `createRedisConnectionOptions`.
- `packages/queue/src/index.test.ts`
  - Delete Redis URL parsing tests and the stable BullMQ queue-name test.
- `apps/api/src/runtime.ts` and `apps/api/src/runtime.test.ts`
  - Remove the fail-fast branch for `legacy_bullmq`; the config layer should reject it before runtime creation.
- `apps/cli/src/app.ts` and `apps/cli/src/app.test.ts`
  - Remove the "legacy BullMQ async transport" display branch.
- `apps/worker/.env.schema`, `apps/api/.env.schema`, `apps/cli/.env.schema`
  - Remove Redis/BullMQ comments and legacy-mode examples.
- `pnpm-lock.yaml`
  - Regenerate with `pnpm install` after package changes.

Docs to update:

- `README.md`
- `docs/DEVELOPMENT.md`
- `docs/deployment-guide.md`
- `docs/staging-validation-guide.md`
- `docs/testing-requirements.md`
- `plans/mailmon-gmail-sync-infrastructure.md`
- Any active plan that says `legacy_bullmq` remains fallback scaffolding.

Do not rewrite historical logs just to remove the string. If a historical document is moved to archive in Phase 4, leave its contents intact and add a short archive index note that historical references may mention removed runtime modes.

Verification:

- `rg "legacy_bullmq|bullmq|REDIS_URL" apps packages docs README.md plans`
  - Expected: no active-code hits, no active-doc hits.
  - Historical archive hits are acceptable only under the archive path.
- `pnpm install`
- `pnpm build`
- `pnpm lint`
- `pnpm typecheck`
- `pnpm test`
- `pnpm exec fallow`

Expected payoff:

- Removes one direct runtime dependency from `@mailmon/worker`.
- Removes a dormant Redis operational mode from config, tests, and docs.
- Improves locality: async transport knowledge becomes local/GCP only instead of spread across API fail-fast code, worker startup, queue helpers, env schema, and docs.

## Phase 2: Remove Fern SDK And Normalize The Active SDK Path

Decision: Speakeasy is the active SDK generator. Fern is no longer an active adapter at any seam. Keeping both SDK trees creates low leverage and high confusion.

Recommended shape after cleanup:

```text
sdks/
  typescript/          # active Speakeasy SDK, package @mailmon.dev/sdk
.speakeasy/
  workflow.yaml        # outputs to sdks/typescript
```

Implementation sequence:

1. Delete the old Fern SDK tree:
   - `sdks/typescript/**` as it exists today
   - `fern/fern.config.json`
   - `fern/generators.yml`
   - `scripts/apply-sdk-customizations.mjs`
2. Move the active Speakeasy SDK:
   - `sdks/typescript-new` -> `sdks/typescript`
3. Update all active references:
   - `.speakeasy/workflow.yaml`
   - `.speakeasy/workflow.lock` if required by Speakeasy
   - `.github/workflows/sdk_generation.yaml`
   - `scripts/generate-sdk-for-release.mjs`
   - `docs/SDK_GENERATION.md`
   - `docs/PUBLISHING.md`
   - `README.md`
   - `apps/api/src/public-contract.test.ts`
   - `.fallowrc.jsonc`
   - any package-lock or generated README references that include the old path
4. Keep package identity unchanged:
   - package name remains `@mailmon.dev/sdk`
   - package version stays owned by Changesets/Speakeasy release flow
5. Decide whether to retain generated build output under the SDK:
   - keep `esm/` if it is needed for publishable package contents
   - keep source and generated docs if Speakeasy regeneration expects them
   - remove generated examples/devcontainer output only after Speakeasy config is changed to stop regenerating it

Generated example cleanup:

- `sdks/typescript-new/examples/mailboxesCreateConnectSession.example.ts` is currently unused.
- It imports `dotenv`, producing Fallow's unlisted dependency report.
- `sdks/typescript-new/.speakeasy/gen.yaml` has:
  - `generation.devContainers.enabled: true`
  - `typescript.generateExamples: true`
- Change those generator settings if supported:
  - disable generated examples unless the team wants checked-in runnable SDK examples
  - disable devcontainer generation unless it is actively used
- Delete these if regeneration no longer restores them:
  - `sdks/typescript/examples/**`
  - `sdks/typescript/examples/package-lock.json`
  - `sdks/typescript/package-lock.json` if it is not needed by the publish process
  - `sdks/typescript/.devcontainer/**`

Verification:

- `rg "sdks/typescript-new"`
  - Expected: no hits.
- `rg "Fern|fernapi|buildwithfern|sdk-fern-legacy|apply-sdk-customizations"`
  - Expected: no active-code or active-doc hits.
- `pnpm sdk:check`
- `pnpm --filter @mailmon.dev/sdk build`
- `pnpm --filter @mailmon.dev/sdk test:webhooks`
- `pnpm build`
- `pnpm lint`
- `pnpm typecheck`
- `pnpm test`
- `pnpm exec fallow`

Expected payoff:

- Removes the old 358-file SDK tree.
- Removes dead Fern generation config.
- Removes a dead customization script.
- Resolves Fallow's unused Speakeasy example and `dotenv` warning if generated examples are disabled or removed.
- Makes `sdks/typescript` the obvious active SDK location.

## Phase 3: Tune Dead-Code And Health Scanning Around Generated Code

Decision: generated SDK internals should not be hand-refactor targets. The scanner should still protect product-maintained code and scripts.

Changes:

- Update `.fallowrc.jsonc` after SDK path normalization:
  - make duplication and health ignore the active generated SDK path, likely `sdks/typescript/**`
  - keep product source, tests, scripts, and packages under scanning
  - keep generated examples out of the repo instead of suppressing them
- Keep `apps/docs/**` ignored for duplicate/health if Mintlify content remains noisy.
- Keep `load/*.k6.js` and `scripts/staging-pubsub-retry-smoke.ts` as manual Fallow entries.
- Consider adding `scripts/run-load-smoke.sh` to a shell/script inventory, since Fallow does not analyze Bash imports.

Verification:

- `pnpm exec fallow`
  - Expected: no dead files from SDK examples or Fern customizers.
  - Expected: top refactoring targets should point to maintained code, not generated Speakeasy internals.
- CI still runs `npx fallow audit --quiet`.

Expected payoff:

- Makes dead-code reports actionable again.
- Avoids wasting architecture work on generated SDK modules.

## Phase 4: Consolidate Docs, Plans, And Logs

Decision: `docs/` should hold durable references, `plans/` should hold active or proposed work, and `logs/` should not compete with current docs. Historical records can exist, but they should be clearly archived.

Recommended target tree:

```text
docs/
  development/
    local-development.md
    testing-requirements.md
  deployment/
    deployment-guide.md
    first-time-deployment.md
    staging-validation-guide.md
  release/
    publishing.md
    sdk-generation.md
  product/
    prd.md
    ubiquitous-language.md
  history/
    README.md
    implementation-logs/
    migration-plans/
plans/
  active/
  archive/
    architecture/
    antithesis/
    cloudflare/
apps/docs/
  ... public Mintlify docs only
antithesis/scratchbook/
  ... property catalog/testing research until promoted or archived
```

Minimal version if a large move is too disruptive:

- Keep root `plans/`.
- Move `docs/plans/**` to `plans/archive/migration/`.
- Move `logs/**` to `docs/history/implementation-logs/` or `plans/archive/logs/`.
- Add `docs/history/README.md` explaining that archived docs are historical evidence, not active guidance.
- Rename typoed files:
  - `plans/clouldflare-findings.md` -> `plans/archive/cloudflare/cloudflare-findings.md`
  - `plans/clouldflare-strategy.md` -> `plans/archive/cloudflare/cloudflare-strategy.md`
- Decide whether `plans/cloudflare-migration-detailed-docs.md` remains active. If not active, archive it with the other Cloudflare documents.

Docs to keep active:

- `README.md`
- `UBIQUITOUS_LANGUAGE.md` or moved equivalent under `docs/product/`
- `docs/PRD.md` or moved equivalent under `docs/product/`
- `docs/DEVELOPMENT.md` or split equivalent under `docs/development/`
- `docs/testing-requirements.md`
- `docs/deployment-guide.md`
- `docs/first-time-deployment.md`
- `docs/staging-validation-guide.md`
- `docs/PUBLISHING.md`
- `docs/SDK_GENERATION.md`
- `docs/launch-readiness.md`
- `plans/antithesis-remaining-testing-work-plan.md` if still active

Docs likely to archive:

- `docs/plans/2026-04-29-*`
- `docs/plans/2026-05-04-*`
- `docs/plans/2026-05-11-effect-v4-migration-plan.md`
- `logs/arch-refactor.md`
- `logs/follow-up.md`
- `logs/followup-refactor-analysis.md`
- `logs/pbt-log.md`
- `logs/pbt-log-remaining.md`
- completed architecture refactor plans, unless there is still open work
- completed Antithesis/PBT implementation plan, because `docs/testing-requirements.md` and `plans/antithesis-remaining-testing-work-plan.md` now carry the active state

Docs to convert rather than archive:

- `docs/staging-validation-debugging-progress.md`
  - Convert current reusable content into `docs/deployment/staging-validation-guide.md`.
  - Archive the long debugging narrative as history.
- `docs/launch-readiness.md`
  - Keep if it remains the launch checklist.
  - Otherwise extract active gates into `docs/release/launch-readiness.md` and archive old dated evidence.

Verification:

- `rg "docs/plans|clouldflare|logs/" README.md docs plans antithesis apps`
  - Expected: no broken active links.
- `pnpm format:check`
- `pnpm exec fallow`
- Manual link spot-check for key docs:
  - README development guide link
  - publishing guide
  - SDK generation guide
  - testing requirements
  - staging validation guide

Expected payoff:

- Future contributors can tell active guidance from historical evidence.
- Plans stop living in two places.
- Logs stop reading like current architecture direction.
- Cloudflare and Antithesis material becomes discoverable without dominating active docs.

## Phase 5: Local Workspace And Ignore Hygiene

Decision: local tools, copied vendor docs, experiments, and local infrastructure state should not be part of the repo.

Actions:

1. Add ignore patterns:
   - `cloud-sql-proxy`
   - `fern-docs.txt`
   - `experiment/`
   - `infra/.state.json`
   - `*.tfstate`
   - `*.tfstate.backup`
   - `.terraform.tfstate.lock.info`
2. Remove local untracked clutter after confirming no user-owned work is needed:
   - `cloud-sql-proxy`
   - `fern-docs.txt`
   - `experiment/`
   - `infra/.state.json`
3. Treat `infra/.state.json` as sensitive:
   - do not quote contents in issues, plans, or reviews
   - if it has ever left the local machine, rotate affected secrets
4. Keep `load/results/*.json` ignored; only `load/results/.gitkeep` should remain tracked.

Verification:

- `git status --short`
  - Expected: no local clutter.
- `git status --ignored --short`
  - Expected: ignored local artifacts appear only if they still exist locally.

Expected payoff:

- Prevents accidental state/secret leaks.
- Keeps local downloaded binaries and scratch output out of review.

## Phase 6: Final Verification And Regression Gates

Run after all cleanup phases:

```bash
pnpm install
pnpm exec fallow
pnpm build
pnpm lint
pnpm typecheck
pnpm test
pnpm format:check
pnpm sdk:check
pnpm --filter @mailmon.dev/sdk build
pnpm --filter @mailmon.dev/sdk test:webhooks
```

Run grep gates:

```bash
rg "legacy_bullmq|bullmq|REDIS_URL" apps packages docs README.md plans
rg "Fern|fernapi|buildwithfern|sdk-fern-legacy|apply-sdk-customizations"
rg "sdks/typescript-new"
```

Acceptable remaining hits:

- archived historical docs only, if clearly under `docs/history/` or `plans/archive/`
- third-party generated text only, if the SDK generator requires it and it is documented

## Proposed Execution Order

1. Safety baseline.
2. Remove BullMQ legacy transport.
3. Remove Fern SDK and move active Speakeasy SDK to `sdks/typescript`.
4. Tune Fallow generated-code ignores.
5. Consolidate docs and archive historical material.
6. Clean local untracked artifacts and update `.gitignore`.
7. Run the full verification matrix.

This order removes runtime ambiguity before docs are reorganized, then updates the docs once the active shape is true in code.

## Risks And Mitigations

- Risk: someone still uses `MAILMON_ASYNC_TRANSPORT_MODE=legacy_bullmq` locally.
  - Mitigation: call out the removal in README/development docs and make local HTTP transport the only local path.
- Risk: Speakeasy regenerates examples/devcontainer/package-lock files after deletion.
  - Mitigation: change generator config first, regenerate once, and only then delete generated output.
- Risk: SDK path rename creates a noisy PR.
  - Mitigation: perform it with `git mv` after deleting the old Fern directory, and keep package name/version unchanged.
- Risk: archived docs still contain old links.
  - Mitigation: archive docs can preserve historical references, but active docs must not link to stale paths.
- Risk: Terraform state exposure.
  - Mitigation: delete local state from the workspace, ignore future copies, and rotate secrets if the state file was shared.

## Success Criteria

- `legacy_bullmq` is gone from active code and active docs.
- `bullmq` is no longer a direct dependency of any workspace package.
- `sdks/typescript` is the active Speakeasy SDK path.
- Fern config and the old Fern SDK are gone.
- `scripts/apply-sdk-customizations.mjs` is gone.
- Fallow reports no unused generated example and no `dotenv` unlisted dependency.
- Fallow health/refactoring targets no longer prioritize generated Speakeasy internals.
- Active docs have one obvious place to live.
- Historical logs and completed plans are archived or removed.
- Sensitive/local untracked files are ignored and absent from normal `git status`.
