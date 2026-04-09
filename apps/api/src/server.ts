import {
  authenticateWorkspaceApiKeyOrFail,
  completeGmailMailboxConnectSession,
  createWebhookEndpoint,
  createWebhookEndpointSubscription,
  createMailboxConnectSession,
  getConnectSessionOrFail,
  getGmailMailboxConnectAuthorizationUrl,
  getMessageOrFail,
  getMailboxOrFail,
  getThreadOrFail,
  listMailboxMessages,
  listMailboxThreads,
  type CreateConnectSessionRequest,
  type CreateWebhookEndpointRequest,
  type CreateWebhookEndpointSubscriptionRequest,
  type ProblemDetails,
  type WebhookEventType,
} from "@mailmon/core";
import { Effect, ManagedRuntime } from "effect";
import { Hono } from "hono";

export type ApiServerRuntime = Pick<ManagedRuntime.ManagedRuntime<any, any>, "runPromise">;

const createProblemResponse = (problem: ProblemDetails) => {
  return new Response(JSON.stringify(problem), {
    status: problem.status,
    headers: {
      "content-type": "application/json",
    },
  });
};

const invalidRequest = (detail: string): ProblemDetails => {
  return {
    type: "https://api.mailmon.dev/problems/invalid-request",
    title: "Invalid request",
    status: 400,
    code: "invalid_request",
    detail,
    retryable: false,
  };
};

const DEFAULT_LIST_LIMIT = 50;
const MAX_LIST_LIMIT = 100;
const INVALID_OPTIONAL_NULLABLE_STRING = Symbol("invalid_optional_nullable_string");

const extractBearerApiKey = (authorizationHeader: string | undefined) => {
  if (authorizationHeader === undefined) {
    return null;
  }

  const [scheme, token] = authorizationHeader.split(/\s+/, 2);

  if (scheme?.toLowerCase() !== "bearer" || token === undefined || token.length === 0) {
    return null;
  }

  return token;
};

const isCreateConnectSessionRequest = (value: unknown): value is CreateConnectSessionRequest => {
  return (
    typeof value === "object" &&
    value !== null &&
    "provider" in value &&
    value.provider === "gmail" &&
    "tenantExternalId" in value &&
    typeof value.tenantExternalId === "string" &&
    value.tenantExternalId.length > 0 &&
    "mailboxExternalId" in value &&
    typeof value.mailboxExternalId === "string" &&
    value.mailboxExternalId.length > 0 &&
    "redirectUrl" in value &&
    typeof value.redirectUrl === "string" &&
    value.redirectUrl.length > 0
  );
};

const isHttpUrl = (value: string) => {
  try {
    const url = new URL(value);

    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
};

const getOptionalStringProperty = (
  value: Readonly<Record<string, unknown>>,
  keys: ReadonlyArray<string>,
) => {
  for (const key of keys) {
    const property = value[key];

    if (property === undefined) {
      continue;
    }

    if (typeof property !== "string" || property.length === 0) {
      return null;
    }

    return property;
  }

  return undefined;
};

const getOptionalNullableStringProperty = (
  value: Readonly<Record<string, unknown>>,
  keys: ReadonlyArray<string>,
) => {
  for (const key of keys) {
    const property = value[key];

    if (property === undefined) {
      continue;
    }

    if (property === null) {
      return null;
    }

    if (typeof property !== "string" || property.length === 0) {
      return INVALID_OPTIONAL_NULLABLE_STRING;
    }

    return property;
  }

  return undefined;
};

const getRequiredStringArrayProperty = (
  value: Readonly<Record<string, unknown>>,
  keys: ReadonlyArray<string>,
) => {
  const property = keys
    .map((key) => value[key])
    .find((candidate) => candidate !== undefined);

  if (!Array.isArray(property) || property.length === 0) {
    return null;
  }

  const items = property.filter((item): item is string => typeof item === "string" && item.length > 0);

  return items.length === property.length ? items : null;
};

const isWebhookEventType = (value: string): value is WebhookEventType => {
  return value === "message.created" || value === "message.updated" || value === "thread.updated";
};

const parseCreateWebhookEndpointRequest = (
  value: unknown,
): CreateWebhookEndpointRequest | null => {
  if (typeof value !== "object" || value === null) {
    return null;
  }

  const body = value as Readonly<Record<string, unknown>>;
  const url = getOptionalStringProperty(body, ["url"]);
  const description = getOptionalNullableStringProperty(body, ["description"]);

  if (
    typeof url !== "string" ||
    !isHttpUrl(url) ||
    description === INVALID_OPTIONAL_NULLABLE_STRING
  ) {
    return null;
  }

  return {
    url,
    description: description ?? null,
  };
};

const parseCreateWebhookEndpointSubscriptionRequest = (
  value: unknown,
): CreateWebhookEndpointSubscriptionRequest | null => {
  if (typeof value !== "object" || value === null) {
    return null;
  }

  const body = value as Readonly<Record<string, unknown>>;
  const mailboxIds = getRequiredStringArrayProperty(body, ["mailboxIds", "mailbox_ids"]);
  const eventTypes = getRequiredStringArrayProperty(body, ["eventTypes", "event_types"]);

  if (mailboxIds === null || eventTypes === null || !eventTypes.every(isWebhookEventType)) {
    return null;
  }

  return {
    mailboxIds,
    eventTypes,
  };
};

const getRequestOrigin = (requestUrl: string) => {
  return new URL(requestUrl).origin;
};

const getMailboxIdQuery = (request: { readonly query: (key: string) => string | undefined }) => {
  return request.query("mailboxId") ?? request.query("mailbox_id") ?? null;
};

const parseListCursor = (request: { readonly query: (key: string) => string | undefined }) => {
  return request.query("cursor") ?? null;
};

const parseListLimit = (request: { readonly query: (key: string) => string | undefined }) => {
  const limitValue = request.query("limit");

  if (limitValue === undefined) {
    return DEFAULT_LIST_LIMIT;
  }

  const parsed = Number.parseInt(limitValue, 10);

  if (!Number.isInteger(parsed) || parsed < 1 || parsed > MAX_LIST_LIMIT) {
    return null;
  }

  return parsed;
};

const buildConnectRedirectUrl = (
  redirectUrl: string,
  params: Readonly<Record<string, string | null | undefined>>,
) => {
  const url = new URL(redirectUrl);

  for (const [key, value] of Object.entries(params)) {
    if (value === null || value === undefined) {
      continue;
    }

    url.searchParams.set(key, value);
  }

  return url.toString();
};

const redirectToConnectResult = (
  redirectUrl: string,
  params: Readonly<Record<string, string | null | undefined>>,
) => {
  return Response.redirect(buildConnectRedirectUrl(redirectUrl, params), 302);
};

const matchProblemEffect = async <A, E, R>(
  runtime: ApiServerRuntime,
  effect: Effect.Effect<A, E, R>,
) => {
  return runtime.runPromise(
    effect.pipe(
      Effect.match({
        onFailure: (problem) => ({ _tag: "failure" as const, problem }),
        onSuccess: (value) => ({ _tag: "success" as const, value }),
      }),
    ),
  );
};

const authenticateRequest = async (
  runtime: ApiServerRuntime,
  authorizationHeader: string | undefined,
) => {
  const apiKey = extractBearerApiKey(authorizationHeader);

  if (apiKey === null) {
    return {
      _tag: "failure" as const,
      problem: invalidRequest("Authorization must use Bearer <mailmon_api_key>."),
    };
  }

  const result = await matchProblemEffect(runtime, authenticateWorkspaceApiKeyOrFail(apiKey));

  if (result._tag === "failure") {
    return result;
  }

  return {
    _tag: "success" as const,
    workspace: result.value,
  };
};

export const createApp = (runtime: ApiServerRuntime) => {
  const app = new Hono();

  app.get("/health", (context) => {
    return context.json({ status: "ok" });
  });

  app.post("/v1/mailboxes/connect-sessions", async (context) => {
    const auth = await authenticateRequest(runtime, context.req.header("authorization"));

    if (auth._tag === "failure") {
      return createProblemResponse(auth.problem);
    }

    const payload = await context.req.json().catch(() => null);

    if (!isCreateConnectSessionRequest(payload)) {
      return createProblemResponse(
        invalidRequest(
          "Body must include provider, tenantExternalId, mailboxExternalId, and redirectUrl.",
        ),
      );
    }

    const result = await matchProblemEffect(
      runtime,
      createMailboxConnectSession(
        auth.workspace.workspaceId,
        payload,
        getRequestOrigin(context.req.url),
      ),
    );

    if (result._tag === "failure") {
      return createProblemResponse(result.problem);
    }

    return context.json(result.value, 201);
  });

  app.post("/v1/webhook-endpoints", async (context) => {
    const auth = await authenticateRequest(runtime, context.req.header("authorization"));

    if (auth._tag === "failure") {
      return createProblemResponse(auth.problem);
    }

    const payload = await context.req.json().catch(() => null);
    const request = parseCreateWebhookEndpointRequest(payload);

    if (request === null) {
      return createProblemResponse(
        invalidRequest("Body must include a valid http(s) url and an optional description."),
      );
    }

    const result = await matchProblemEffect(
      runtime,
      createWebhookEndpoint(auth.workspace.workspaceId, request),
    );

    if (result._tag === "failure") {
      return createProblemResponse(result.problem);
    }

    return context.json(result.value, 201);
  });

  app.post("/v1/webhook-endpoints/:endpointId/subscriptions", async (context) => {
    const auth = await authenticateRequest(runtime, context.req.header("authorization"));

    if (auth._tag === "failure") {
      return createProblemResponse(auth.problem);
    }

    const payload = await context.req.json().catch(() => null);
    const request = parseCreateWebhookEndpointSubscriptionRequest(payload);

    if (request === null) {
      return createProblemResponse(
        invalidRequest(
          "Body must include mailboxIds/mailbox_ids and eventTypes/event_types arrays.",
        ),
      );
    }

    const result = await matchProblemEffect(
      runtime,
      createWebhookEndpointSubscription(
        auth.workspace.workspaceId,
        context.req.param("endpointId"),
        request,
      ),
    );

    if (result._tag === "failure") {
      return createProblemResponse(result.problem);
    }

    return context.json(result.value, 201);
  });

  app.get("/v1/mailboxes/:mailboxId", async (context) => {
    const auth = await authenticateRequest(runtime, context.req.header("authorization"));

    if (auth._tag === "failure") {
      return createProblemResponse(auth.problem);
    }

    const result = await matchProblemEffect(
      runtime,
      getMailboxOrFail(context.req.param("mailboxId"), {
        workspaceId: auth.workspace.workspaceId,
      }),
    );

    if (result._tag === "failure") {
      return createProblemResponse(result.problem);
    }

    return context.json(result.value);
  });

  app.get("/v1/messages", async (context) => {
    const auth = await authenticateRequest(runtime, context.req.header("authorization"));

    if (auth._tag === "failure") {
      return createProblemResponse(auth.problem);
    }

    const mailboxId = getMailboxIdQuery(context.req);

    if (mailboxId === null) {
      return createProblemResponse(
        invalidRequest("Query must include mailboxId or mailbox_id."),
      );
    }

    const limit = parseListLimit(context.req);

    if (limit === null) {
      return createProblemResponse(
        invalidRequest(`Query parameter limit must be an integer between 1 and ${MAX_LIST_LIMIT}.`),
      );
    }

    const result = await matchProblemEffect(
      runtime,
      listMailboxMessages(mailboxId, {
        cursor: parseListCursor(context.req),
        limit,
        workspaceId: auth.workspace.workspaceId,
      }),
    );

    if (result._tag === "failure") {
      return createProblemResponse(result.problem);
    }

    return context.json(result.value);
  });

  app.get("/v1/messages/:messageId", async (context) => {
    const auth = await authenticateRequest(runtime, context.req.header("authorization"));

    if (auth._tag === "failure") {
      return createProblemResponse(auth.problem);
    }

    const result = await matchProblemEffect(
      runtime,
      getMessageOrFail(context.req.param("messageId"), {
        workspaceId: auth.workspace.workspaceId,
      }),
    );

    if (result._tag === "failure") {
      return createProblemResponse(result.problem);
    }

    return context.json(result.value);
  });

  app.get("/v1/threads", async (context) => {
    const auth = await authenticateRequest(runtime, context.req.header("authorization"));

    if (auth._tag === "failure") {
      return createProblemResponse(auth.problem);
    }

    const mailboxId = getMailboxIdQuery(context.req);

    if (mailboxId === null) {
      return createProblemResponse(
        invalidRequest("Query must include mailboxId or mailbox_id."),
      );
    }

    const limit = parseListLimit(context.req);

    if (limit === null) {
      return createProblemResponse(
        invalidRequest(`Query parameter limit must be an integer between 1 and ${MAX_LIST_LIMIT}.`),
      );
    }

    const result = await matchProblemEffect(
      runtime,
      listMailboxThreads(mailboxId, {
        cursor: parseListCursor(context.req),
        limit,
        workspaceId: auth.workspace.workspaceId,
      }),
    );

    if (result._tag === "failure") {
      return createProblemResponse(result.problem);
    }

    return context.json(result.value);
  });

  app.get("/v1/threads/:threadId", async (context) => {
    const auth = await authenticateRequest(runtime, context.req.header("authorization"));

    if (auth._tag === "failure") {
      return createProblemResponse(auth.problem);
    }

    const result = await matchProblemEffect(
      runtime,
      getThreadOrFail(context.req.param("threadId"), {
        workspaceId: auth.workspace.workspaceId,
      }),
    );

    if (result._tag === "failure") {
      return createProblemResponse(result.problem);
    }

    return context.json(result.value);
  });

  app.get("/oauth/gmail/callback", async (context) => {
    const connectSessionId = context.req.query("state");

    if (connectSessionId === undefined || connectSessionId.length === 0) {
      return createProblemResponse(
        invalidRequest("OAuth callback is missing the connect session state."),
      );
    }

    const connectSessionResult = await matchProblemEffect(
      runtime,
      getConnectSessionOrFail(connectSessionId),
    );

    if (connectSessionResult._tag === "failure") {
      return createProblemResponse(connectSessionResult.problem);
    }

    if (context.req.query("error") !== undefined) {
      return redirectToConnectResult(connectSessionResult.value.redirectUrl, {
        code: context.req.query("error") ?? "gmail_authorization_denied",
        detail:
          context.req.query("error_description") ?? "The Gmail authorization flow was cancelled.",
        status: "error",
      });
    }

    const code = context.req.query("code");

    if (code === undefined || code.length === 0) {
      return redirectToConnectResult(connectSessionResult.value.redirectUrl, {
        code: "gmail_authorization_code_missing",
        status: "error",
      });
    }

    const completion = await matchProblemEffect(
      runtime,
      completeGmailMailboxConnectSession(connectSessionId, code, getRequestOrigin(context.req.url)),
    );

    if (completion._tag === "failure") {
      return redirectToConnectResult(connectSessionResult.value.redirectUrl, {
        code: completion.problem.code,
        detail: completion.problem.detail,
        mailbox_id: completion.problem.resource?.mailbox_id ?? null,
        status: "error",
      });
    }

    return redirectToConnectResult(completion.value.redirectUrl, {
      created: completion.value.created ? "true" : "false",
      mailbox_id: completion.value.mailbox.id,
      status: "success",
    });
  });

  app.get("/oauth/gmail/:connectSessionId", async (context) => {
    const result = await matchProblemEffect(
      runtime,
      getGmailMailboxConnectAuthorizationUrl(
        context.req.param("connectSessionId"),
        getRequestOrigin(context.req.url),
      ),
    );

    if (result._tag === "failure") {
      return createProblemResponse(result.problem);
    }

    return Response.redirect(result.value, 302);
  });

  return app;
};
