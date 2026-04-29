# Schema-First Decoding & OpenAPI Auto-Generation Plan

Date: 2026-04-29
Scope: `apps/api`, `@mailmon/core`
Goal: Migrate from manual request parsing to Effect Schema-driven validation and automatically generate the OpenAPI specification using `hono-openapi`.

## Context & Research

Recent research on Hono and Effect integrations highlights `hono-openapi` as the modern standard for this architecture.

Instead of using `@hono/effect-validator` in isolation, `hono-openapi` provides:

1. A drop-in `validator` middleware that supports Effect Schemas natively (via Standard Schema).
2. The `describeRoute` middleware to attach response schemas, summaries, and descriptions.
3. Automatic extraction of query, path, and body schemas into the final OpenAPI document.

This perfectly aligns with our goal of "Schema-first decoding everywhere" while completely automating the maintenance of `apps/docs/api-reference/openapi.json`.

## Proposed Architecture

1. **Schema Definition**: All request and response structures will be formally defined using `@effect/schema` within `@mailmon/core/contracts.ts` (or alongside the existing models).
2. **Validation Middleware**: Replace custom `parseJsonBody` and manual query validators in `apps/api/src/http/parsers.ts` with `hono-openapi`'s `validator` middleware.
3. **Problem Envelope Mapping**: Provide a custom hook to the `validator` middleware to map Effect Schema `ParseError`s into our standardized `ProblemDetails` JSON response format (ensuring we keep the `invalid_request` guarantees established in the previous refactor).
4. **OpenAPI Generation**: Serve the dynamically generated `openapi.json` directly from `apps/api` and point the `apps/docs` build pipeline to it.

## Execution Steps

### Step 1: Install Dependencies

Add the required package to `apps/api`:

```bash
pnpm --filter @mailmon/api add hono-openapi
```

### Step 2: Define Effect Schemas

In `apps/api/src/http/parsers.ts` (or `@mailmon/core` if shared), define the schemas using the existing `effect` dependency:

```typescript
import { Schema } from "effect";

export const ConnectSessionBodySchema = Schema.Struct({
  provider: Schema.Literal("gmail"),
  tenantExternalId: Schema.NonEmptyString,
  mailboxExternalId: Schema.NonEmptyString,
  redirectUrl: Schema.NonEmptyString,
});

export const ListQuerySchema = Schema.Struct({
  mailboxId: Schema.optional(Schema.String),
  mailbox_id: Schema.optional(Schema.String),
  limit: Schema.optional(Schema.Number).pipe(Schema.default(50)),
  cursor: Schema.optional(Schema.String),
});
// ... define for Webhooks, etc.
```

### Step 3: Create a Standardized Validator Hook

To maintain our strict `ProblemDetails` error format, we need a reusable hook for the validators:

```typescript
import { validator as honoValidator } from "hono-openapi";
import { invalidRequest } from "./parsers.js";
import { createProblemResponse } from "./handlers.js";

export const validate = (target, schema) => {
  return honoValidator(target, schema, (result, c) => {
    if (!result.success) {
      // Map Effect Schema error to our detail string
      return createProblemResponse(invalidRequest("Validation failed: ..."));
    }
  });
};
```

### Step 4: Refactor Route Handlers (`server.ts`)

Update `apps/api/src/server.ts` to use declarative middleware instead of imperative parsing:

```typescript
import { describeRoute } from "hono-openapi";
import { validate } from "./http/handlers.js";

app.post(
  "/v1/mailboxes/connect-sessions",
  describeRoute({
    description: "Create a new connect session",
    responses: { 200: { description: "Session created" } },
  }),
  validate("json", ConnectSessionBodySchema),
  async (context) => {
    // ... auth ...
    const request = context.req.valid("json"); // Fully typed!
    // ... execution ...
  },
);
```

### Step 5: Expose the OpenAPI Spec

Add the OpenAPI handler to the bottom of `server.ts`:

```typescript
import { openAPIRouteHandler } from "hono-openapi";

app.get(
  "/openapi.json",
  openAPIRouteHandler(app, {
    documentation: {
      info: { title: "Mailmon API", version: "1.0.0" },
    },
  }),
);
```

### Step 6: Validate & Test

- Run `pnpm test --filter @mailmon/api` to ensure all our `sandbox-e2e.test.ts` and `server.test.ts` assertions regarding deterministic `invalid_request` details remain completely intact.
- Verify the generated `/openapi.json` matches the manually maintained one in `apps/docs`.

## Risks and Mitigations

- **Risk**: The generated OpenAPI spec format differs slightly from the hand-written `apps/docs/api-reference/openapi.json`, breaking the Mintlify docs.
- **Mitigation**: Diff the generated JSON against the static one during implementation. Use `describeRoute` customization to bridge any gaps.
- **Risk**: Losing the highly specific, human-readable error messages we just implemented (e.g., "Body must include a valid http(s) url").
- **Mitigation**: Utilize Effect Schema annotations (`Schema.annotations({ message: ... })`) to embed those exact strings into the schema, then extract them in our custom validation hook.
