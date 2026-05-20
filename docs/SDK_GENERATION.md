# TypeScript SDK Generation

Mailmon generates its TypeScript SDK from the Hono OpenAPI route metadata in `apps/api` and Speakeasy. The active publishable SDK lives in `sdks/typescript` and is generated as the `mailmon-typescript` target in the root Speakeasy monorepo workflow.

## Commands

Generate the checked-in OpenAPI file:

```bash
pnpm openapi:generate
```

Validate the OpenAPI document that Speakeasy consumes:

```bash
pnpm sdk:check
```

Generate the SDK locally into `sdks/typescript`:

```bash
pnpm sdk:generate
```

Trigger Speakeasy generation in GitHub instead of generating locally:

```bash
pnpm sdk:generate:github
```

Before publishing a release, use the dedicated script when Speakeasy credentials are available. It regenerates the SDK and passes the current `sdks/typescript/package.json` version to Speakeasy while skipping automatic Speakeasy version bumps, so Changesets remains the source of truth for package versions:

```bash
pnpm sdk:generate:release
```

## Monorepo Layout

- `.speakeasy/workflow.yaml` is the root Speakeasy monorepo workflow. It maps the `mailmon-api` source to the `mailmon-typescript` target and writes the generated SDK to `sdks/typescript`.
- `sdks/typescript/.speakeasy/gen.yaml` contains TypeScript generator options such as package name, module format, Zod version, error names, request parameter style, and package metadata.
- `sdks/typescript/.speakeasy/speakeasy-modifications-overlay.yaml` stores SDK-specific OpenAPI overlay changes without mutating the generated API contract file directly.
- `apps/docs/api-reference/openapi.json` is the checked-in source document consumed by Speakeasy after `pnpm openapi:generate`.
- `.github/workflows/sdk_generation.yaml` runs the Speakeasy `mailmon-typescript` target in CI and opens PRs for generated SDK updates.

## Configuration Notes

The Speakeasy workflow follows the monorepo pattern: a single root `.speakeasy/workflow.yaml` owns source-to-target mapping, while each SDK folder owns its language-specific `.speakeasy/gen.yaml`.

When changing TypeScript SDK behavior, prefer `sdks/typescript/.speakeasy/gen.yaml` over editing generated source. Generated source in `sdks/typescript/src`, `docs`, `FUNCTIONS.md`, `USAGE.md`, and `README.md` may be rewritten by `speakeasy run`.

When changing the public HTTP contract, update the API route metadata or the OpenAPI normalization layer before regenerating:

- `apps/api/src/generate-openapi.ts` builds the Hono app, generates the OpenAPI document, and writes `apps/docs/api-reference/openapi.json`.
- `apps/api/src/http/openapi-normalization.ts` owns public OpenAPI compatibility policy before the document reaches Speakeasy.
- Use the Speakeasy overlay only for SDK-generation concerns that should not change the public API source.

## GitHub Generation

Manual generation:

1. Open the `Generate TypeScript SDK` workflow in GitHub Actions.
2. Choose `Run workflow`.
3. Set `force` when the OpenAPI input has not changed but you still need a regenerated SDK.
4. Optionally set `set_version` to force a specific SDK version for that generation PR.

The workflow requires `SPEAKEASY_API_KEY` as a repository secret. It also uses `GITHUB_TOKEN` for the generated PR.

## Compatibility Notes

The runtime API accepts a few snake_case compatibility fields, but the generated SDK uses Mailmon's canonical camelCase request shape. Keep SDK-facing schema fixes in `openapi-normalization.ts` when they also describe the public HTTP contract.

Query parameters in the public OpenAPI should be optional rather than nullable unless the wire format has a real nullable value. Query strings omit absent values instead of sending JSON `null`, so normalize those query schemas in `openapi-normalization.ts` rather than editing generated SDK declarations.

Do not patch generated request or response types manually. If the generated SDK type is wrong, fix the OpenAPI source or add a documented Speakeasy overlay change.
