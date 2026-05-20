# API Effect-Aligned Refactor Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Refactor `apps/api` to remove adapter bloat, make request handling more idiomatic Effect, and tighten selected validation behavior without breaking endpoint correctness.

**Architecture:** Keep Hono as a thin HTTP adapter and keep all product logic in `@mailmon/core`. Introduce small, composable adapter helpers for auth, Effect execution, and parsing so each route follows one deterministic pipeline. Apply user-approved behavior tightenings only at request-boundary validation and document every externally visible change.

**Tech Stack:** TypeScript (NodeNext ESM), Effect, Hono, Vitest, oxlint

---

### Task 1: Lock Intended Behavior With Failing Route Tests

**Files:**

- Modify: `apps/api/src/server.test.ts`
- Test: `apps/api/src/server.test.ts`

**Step 1: Write the failing test**

Add route-level tests for the new deterministic validation behavior (these should fail before refactor):

```ts
it("returns invalid_request when connect session body is malformed JSON", async () => {
  const { app } = createRuntime();
  const response = await app.request("/v1/mailboxes/connect-sessions", {
    method: "POST",
    headers: {
      authorization: "Bearer test-api-key",
      "content-type": "application/json",
    },
    body: "{ not-json",
  });

  expect(response.status).toBe(400);
  await expect(response.json()).resolves.toMatchObject({
    code: "invalid_request",
    detail: "Body must be valid JSON.",
  });
});
```

Also add equivalent deterministic-detail tests for:

- invalid `limit`
- missing `mailboxId/mailbox_id`
- invalid webhook `eventTypes`

**Step 2: Run test to verify it fails**

Run: `pnpm --filter @mailmon/api test -- src/server.test.ts -t "malformed JSON"`
Expected: FAIL with detail mismatch (current code returns a different generic detail).

**Step 3: Write minimal implementation**

Do not change behavior broadly yet; only introduce minimal helper stubs/constants needed to support deterministic details in later tasks.

```ts
const INVALID_JSON_DETAIL = "Body must be valid JSON.";
```

**Step 4: Run test to verify it still fails for unimplemented paths**

Run: `pnpm --filter @mailmon/api test -- src/server.test.ts -t "malformed JSON"`
Expected: FAIL (keeps TDD red state before actual parser/helper implementation).

**Step 5: Commit**

```bash
git add apps/api/src/server.test.ts
git commit -m "test(api): define deterministic request validation behavior"
```

### Task 2: Introduce Parser Module (Effect-Aligned Boundary Decoding)

**Files:**

- Create: `apps/api/src/http/parsers.ts`
- Create: `apps/api/src/http/parsers.test.ts`
- Modify: `apps/api/src/server.ts`

**Step 1: Write the failing test**

Create parser unit tests first, including query aliases and invalid JSON handling contract:

```ts
describe("parseListParams", () => {
  it("accepts mailboxId and mailbox_id aliases", () => {
    expect(parseMailboxId({ mailboxId: "mbx_1" })).toEqual({ _tag: "success", value: "mbx_1" });
    expect(parseMailboxId({ mailbox_id: "mbx_2" })).toEqual({ _tag: "success", value: "mbx_2" });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm --filter @mailmon/api test -- src/http/parsers.test.ts`
Expected: FAIL with module/function not found.

**Step 3: Write minimal implementation**

Implement parser helpers that return tagged parse results and never throw:

```ts
export type ParseResult<A> =
  | { readonly _tag: "success"; readonly value: A }
  | { readonly _tag: "failure"; readonly problem: ProblemDetails };

export const parseMailboxId = (query: QueryMap): ParseResult<string> => {
  const mailboxId = query.mailboxId ?? query.mailbox_id;
  return typeof mailboxId === "string" && mailboxId.length > 0
    ? { _tag: "success", value: mailboxId }
    : { _tag: "failure", problem: invalidRequest("Query must include mailboxId or mailbox_id.") };
};
```

Also add parsers for:

- list limit/cursor
- create webhook endpoint body
- create webhook subscription body
- connect session body

**Step 4: Run test to verify it passes**

Run: `pnpm --filter @mailmon/api test -- src/http/parsers.test.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add apps/api/src/http/parsers.ts apps/api/src/http/parsers.test.ts apps/api/src/server.ts
git commit -m "refactor(api): extract request parsers with deterministic failures"
```

### Task 3: Introduce Handler Helpers For Auth + Effect Execution

**Files:**

- Create: `apps/api/src/http/handlers.ts`
- Create: `apps/api/src/http/handlers.test.ts`
- Modify: `apps/api/src/server.ts`

**Step 1: Write the failing test**

Add unit tests for:

- missing Bearer key -> `400 invalid_request`
- failed core effect -> mapped `ProblemDetails` response
- success effect -> value passthrough

```ts
it("maps effect failure to problem response", async () => {
  const result = await runProblemEffect(runtime, Effect.fail(problem));
  expect(result).toEqual({ _tag: "failure", problem });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm --filter @mailmon/api test -- src/http/handlers.test.ts`
Expected: FAIL with missing module/functions.

**Step 3: Write minimal implementation**

Implement helpers and instrument with Effect-friendly structure (`Effect.gen` where sequencing is needed):

```ts
export const withWorkspaceAuth = (
  runtime: ApiServerRuntime,
  authorizationHeader: string | undefined,
) =>
  Effect.gen(function* () {
    const apiKey = extractBearerApiKey(authorizationHeader);
    if (apiKey === null) {
      return {
        _tag: "failure" as const,
        problem: invalidRequest("Authorization must use Bearer <mailmon_api_key>."),
      };
    }
    return yield* runProblemEffect(runtime, authenticateWorkspaceApiKeyOrFail(apiKey)).pipe(
      Effect.map((result) =>
        result._tag === "success" ? { _tag: "success" as const, workspace: result.value } : result,
      ),
    );
  });
```

**Step 4: Run test to verify it passes**

Run: `pnpm --filter @mailmon/api test -- src/http/handlers.test.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add apps/api/src/http/handlers.ts apps/api/src/http/handlers.test.ts apps/api/src/server.ts
git commit -m "refactor(api): extract auth and effect-response handler helpers"
```

### Task 4: Refactor Message/Thread/Mailbox Read Routes To Shared Pipeline

**Files:**

- Modify: `apps/api/src/server.ts`
- Modify: `apps/api/src/server.test.ts`

**Step 1: Write the failing test**

Add focused route tests for normalized list parameter failures (deterministic details/codes).

```ts
it("rejects non-integer limit with deterministic invalid_request detail", async () => {
  const { app } = createRuntime();
  const response = await app.request("/v1/messages?mailbox_id=mbx_demo&limit=abc", {
    headers: { authorization: "Bearer test-api-key" },
  });

  expect(response.status).toBe(400);
  await expect(response.json()).resolves.toMatchObject({
    code: "invalid_request",
    detail: "Query parameter limit must be an integer between 1 and 100.",
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm --filter @mailmon/api test -- src/server.test.ts -t "non-integer limit"`
Expected: FAIL if message/flow mismatch exists during migration.

**Step 3: Write minimal implementation**

Migrate read routes to helper-driven pipeline:

- `/v1/mailboxes/:mailboxId`
- `/v1/mailboxes/:mailboxId/sync-runs`
- `/v1/mailboxes/:mailboxId/observability`
- `/v1/messages`, `/v1/messages/:messageId`
- `/v1/threads`, `/v1/threads/:threadId`

```ts
app.get("/v1/messages", async (context) => {
  const auth = await runAuth(runtime, context.req.header("authorization"));
  if (auth._tag === "failure") return createProblemResponse(auth.problem);

  const params = parseMailboxListQuery(context.req);
  if (params._tag === "failure") return createProblemResponse(params.problem);

  const result = await runProblemEffect(
    runtime,
    listMailboxMessages(params.value.mailboxId, {
      cursor: params.value.cursor,
      limit: params.value.limit,
      workspaceId: auth.workspace.workspaceId,
    }),
  );

  return result._tag === "failure"
    ? createProblemResponse(result.problem)
    : context.json(result.value);
});
```

**Step 4: Run test to verify it passes**

Run: `pnpm --filter @mailmon/api test -- src/server.test.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add apps/api/src/server.ts apps/api/src/server.test.ts
git commit -m "refactor(api): migrate read routes to shared auth-parse-execute pipeline"
```

### Task 5: Refactor Connect/Webhook/OAuth Routes + Tighten Validation

**Files:**

- Modify: `apps/api/src/server.ts`
- Modify: `apps/api/src/server.test.ts`
- Modify: `apps/api/src/sandbox-e2e.test.ts` (only if response-detail assertions need updates)

**Step 1: Write the failing test**

Add or tighten tests for:

- malformed JSON body returns explicit invalid JSON detail
- invalid webhook event types return deterministic invalid request detail
- OAuth callback error mapping remains stable (`status`, `code`, optional `mailbox_id`)

```ts
it("rejects unsupported webhook event type with deterministic detail", async () => {
  const { app } = createRuntime();
  const response = await app.request("/v1/webhook-endpoints/whe_demo/subscriptions", {
    method: "POST",
    headers: {
      authorization: "Bearer test-api-key",
      "content-type": "application/json",
    },
    body: JSON.stringify({ mailboxIds: ["mbx_demo"], eventTypes: ["message.deleted"] }),
  });

  expect(response.status).toBe(400);
  await expect(response.json()).resolves.toMatchObject({ code: "invalid_request" });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm --filter @mailmon/api test -- src/server.test.ts -t "unsupported webhook event type"`
Expected: FAIL before parser tightening is fully wired.

**Step 3: Write minimal implementation**

Migrate these routes to shared helpers/parsers:

- `POST /v1/mailboxes/connect-sessions`
- `POST /v1/webhook-endpoints`
- `POST /v1/webhook-endpoints/:endpointId/subscriptions`
- `GET /oauth/gmail/callback`
- `GET /oauth/gmail/:connectSessionId`

Keep redirect query contract stable while centralizing redirect param assembly.

**Step 4: Run test to verify it passes**

Run: `pnpm --filter @mailmon/api test -- src/server.test.ts src/sandbox-e2e.test.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add apps/api/src/server.ts apps/api/src/server.test.ts apps/api/src/sandbox-e2e.test.ts
git commit -m "refactor(api): normalize write-route validation and oauth callback mapping"
```

### Task 6: Runtime Cleanup (Mode Selection Readability, No Behavior Drift)

**Files:**

- Modify: `apps/api/src/runtime.ts`
- Create: `apps/api/src/runtime.test.ts`

**Step 1: Write the failing test**

Add runtime tests for:

- `gcp` mode requires `MAILMON_SYNC_DISPATCH_PUBSUB_TOPIC_NAME`
- `local` mode uses worker HTTP dispatcher config

**Step 2: Run test to verify it fails**

Run: `pnpm --filter @mailmon/api test -- src/runtime.test.ts`
Expected: FAIL (missing exports/tests initially).

**Step 3: Write minimal implementation**

Refactor mode selection into small internal helpers (no contract change):

```ts
const createMailboxSyncDispatcherLayer = (env: RuntimeEnv) => {
  if (env.asyncTransportMode === "gcp") {
    return createGcpMailboxSyncDispatcherLayer({ topicName: requireGcpApiValue(...) });
  }

  return createWorkerHttpMailboxSyncDispatcherLayer({ workerBaseUrl: env.workerBaseUrl });
};
```

Export test-only helpers only if needed and keep production API unchanged.

**Step 4: Run test to verify it passes**

Run: `pnpm --filter @mailmon/api test -- src/runtime.test.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add apps/api/src/runtime.ts apps/api/src/runtime.test.ts
git commit -m "refactor(api): simplify runtime mode dispatch layer selection"
```

### Task 7: Document Behavior Changes + Full Verification

**Files:**

- Modify: `docs/plans/2026-04-29-api-effect-refactor-design.md`
- Create: `docs/plans/2026-04-29-api-effect-refactor-change-log.md`

**Step 1: Write the failing test**

No code test in this step. Instead, define the doc checklist before writing:

- old behavior
- new behavior
- why changed
- tests proving correctness

**Step 2: Run verification commands before docs finalization**

Run:

- `pnpm --filter @mailmon/api test`
- `pnpm --filter @mailmon/api typecheck`
- `pnpm --filter @mailmon/api lint`
- `pnpm typecheck`

Expected: all PASS.

**Step 3: Write minimal implementation**

Add a concise change log documenting every user-visible tightening:

```md
## Validation Tightening

- POST /v1/mailboxes/connect-sessions malformed JSON now returns detail "Body must be valid JSON."
- POST /v1/webhook-endpoints/:endpointId/subscriptions invalid eventTypes now returns deterministic invalid_request detail
```

**Step 4: Run final verification after doc updates**

Run: `pnpm --filter @mailmon/api test`
Expected: PASS (docs do not affect code behavior).

**Step 5: Commit**

```bash
git add docs/plans/2026-04-29-api-effect-refactor-design.md docs/plans/2026-04-29-api-effect-refactor-change-log.md
git commit -m "docs(api): record effect-aligned refactor behavior changes"
```

---

## Implementation Notes

- Follow `effect-solutions` guidance while coding:
  - `pnpm exec effect-solutions show basics services-and-layers error-handling`
- Keep imports NodeNext-compatible (`.js` suffix for relative imports).
- Keep `apps/api` adapter-only: no domain logic in route modules.
- Preserve mailbox/workspace terminology from `UBIQUITOUS_LANGUAGE.md`.
- Do not remove existing endpoint paths or response shapes unless explicitly covered by documented tightening.

## Done Criteria

- `apps/api/src/server.ts` is significantly smaller and route-centric.
- Shared auth/effect/parsing helpers exist and are covered by tests.
- Validation tightenings are deterministic, tested, and documented.
- API package tests/typecheck/lint pass, and workspace typecheck passes.
