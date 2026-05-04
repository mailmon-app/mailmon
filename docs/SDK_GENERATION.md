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
- `fern/generators.yml` points Fern at that OpenAPI file and configures the local TypeScript SDK output.
- `fern/fern.config.json` pins Fern to the locally installed CLI by using `"version": "*"`.

## Compatibility Notes

The runtime API accepts a few snake_case compatibility fields, but the generated SDK uses Mailmon's canonical camelCase request shape. The OpenAPI generation script removes those compatibility aliases from the SDK-facing spec because Fern cannot generate request types with both `mailboxId` and `mailbox_id` resolving to the same TypeScript name.
