# TypeScript SDK Generation

Mailmon generates its TypeScript SDK from the Hono OpenAPI route metadata in `apps/api`.

## Commands

Generate the checked-in OpenAPI file:

```bash
pnpm openapi:generate
```

Validate the Fern definition:

```bash
pnpm sdk:check
```

Generate the SDK locally into `sdks/typescript`:

```bash
pnpm sdk:generate
```

Local generation uses Fern's Docker-backed generator runner. If Docker is not available, either enable Docker for the current environment or use Fern remote generation:

```bash
fern login
pnpm sdk:generate:remote
```

## Files

- `apps/api/src/generate-openapi.ts` builds the Hono app, generates the OpenAPI document, normalizes it for Fern, and writes `apps/docs/api-reference/openapi.json`.
- `apps/api/src/http/openapi-normalization.ts` owns the public OpenAPI compatibility policy before the document reaches Fern. Keep SDK-facing schema fixes here when they also describe the public HTTP contract.
- `fern/generators.yml` points Fern at that OpenAPI file and configures the local TypeScript SDK output.
- `sdks/typescript/.fernignore` protects custom SDK helper files and preserved package metadata, including `CHANGELOG.md`, from Fern regeneration.
- `scripts/apply-sdk-customizations.mjs` reapplies custom TypeScript SDK export wiring and README sections after Fern generation.
- `fern/fern.config.json` pins Fern to the locally installed CLI by using `"version": "*"`.

## Compatibility Notes

The runtime API accepts a few snake_case compatibility fields, but the generated SDK uses Mailmon's canonical camelCase request shape. The OpenAPI generation script removes those compatibility aliases from the SDK-facing spec because Fern cannot generate request types with both `mailboxId` and `mailbox_id` resolving to the same TypeScript name.

Query parameters in the public OpenAPI should be optional rather than nullable unless the wire format has a real nullable value. Fern turns nullable query schemas into `string | null` SDK inputs, but query strings omit absent values instead of sending JSON `null`. Normalize those query schemas in `openapi-normalization.ts`, not by editing generated SDK declarations.

Do not use `apply-sdk-customizations.mjs` to patch generated request or response types. If the generated SDK type is wrong, fix the OpenAPI source or add a documented Fern OpenAPI override. Reserve the customization script for custom helper wiring that Fern does not generate, such as webhook helper exports.
