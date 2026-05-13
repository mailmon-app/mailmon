import {
  completeGmailMailboxConnectSession,
  createReplay,
  createWebhookEndpoint,
  createWebhookEndpointSubscription,
  createMailboxConnectSession,
  getConnectSessionOrFail,
  getReplayOrFail,
  getMailboxObservability,
  getGmailMailboxConnectAuthorizationUrl,
  getMessageOrFail,
  getMailboxOrFail,
  getThreadOrFail,
  listMailboxSyncRuns,
  listMailboxMessages,
  listMailboxThreads,
  PublicConnectSessionResourceSchema,
  PublicCreatedWebhookEndpointResourceSchema,
  PublicListResourceSchema,
  PublicMailboxObservabilitySnapshotResourceSchema,
  PublicMailboxResourceSchema,
  PublicMailboxSyncRunInspectionResourceSchema,
  PublicMessageResourceSchema,
  PublicProblemDetailsSchema,
  PublicReplayResourceSchema,
  PublicThreadListItemResourceSchema,
  PublicThreadResourceSchema,
  PublicWebhookEndpointSubscriptionResourceSchema,
  type MailboxSyncRunInspectionResource,
} from "@mailmon/core";
import { Hono } from "hono";
import type { HonoRequest } from "hono";
import { describeRoute, openAPIRouteHandler, type GenerateSpecOptions } from "hono-openapi";
import { HTTPException } from "hono/http-exception";

import {
  authenticateRequest,
  createProblemResponse,
  runProblemEffect,
  type ApiServerRuntime,
} from "./http/handlers.js";
import {
  CreateConnectSessionBodySchema,
  CreateReplayBodySchema,
  CreateWebhookEndpointBodySchema,
  CreateWebhookEndpointSubscriptionBodySchema,
  CursorLimitQuerySchema,
  DEFAULT_LIST_LIMIT,
  INVALID_CONNECT_SESSION_BODY_DETAIL,
  INVALID_JSON_DETAIL,
  INVALID_LIMIT_DETAIL,
  INVALID_REPLAY_BODY_DETAIL,
  INVALID_WEBHOOK_ENDPOINT_BODY_DETAIL,
  MailboxListQuerySchema,
  type CreateReplayBody,
  type CreateWebhookEndpointSubscriptionBody,
  type CursorLimitQueryParams,
  type MailboxListQueryParams,
  invalidRequest,
} from "./http/parsers.js";
import {
  mailboxListQueryDetail,
  subscriptionBodyDetail,
  toOpenApiJsonSchema,
  validate,
} from "./http/validation.js";

const getRequestOrigin = (req: HonoRequest) => {
  const forwardedProto = req.header("x-forwarded-proto");
  const forwardedHost = req.header("x-forwarded-host") || req.header("host");
  if (forwardedProto && forwardedHost) {
    return `${forwardedProto}://${forwardedHost}`;
  }
  return new URL(req.url).origin;
};

const toSyncRunsResponse = (response: {
  readonly object: "list";
  readonly data: ReadonlyArray<MailboxSyncRunInspectionResource>;
  readonly nextCursor: string | null;
}) => {
  return {
    object: response.object,
    data: response.data.map((run) => ({
      syncRunId: run.syncRunId,
      mailboxId: run.mailboxId,
      startedAt: run.startedAt,
      completedAt: run.completedAt,
      status: run.status,
      detail: run.detail,
      eventsEmitted: run.eventsEmitted,
      leaseOwnerId: run.leaseOwnerId,
      previousCursor: run.previousCursor,
      nextCursor: run.nextCursor,
      cursorAdvanced: run.cursorAdvanced,
    })),
    nextCursor: response.nextCursor,
  };
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

const jsonResponse = (description: string, schema: object) => {
  return {
    description,
    content: {
      "application/json": {
        schema,
      },
    },
  } as const;
};

const publicJsonSchema = toOpenApiJsonSchema;

const connectSessionSchema = publicJsonSchema(PublicConnectSessionResourceSchema);
const createdWebhookEndpointSchema = publicJsonSchema(PublicCreatedWebhookEndpointResourceSchema);
const webhookEndpointSubscriptionListSchema = publicJsonSchema(
  PublicListResourceSchema(PublicWebhookEndpointSubscriptionResourceSchema),
);
const mailboxSchema = publicJsonSchema(PublicMailboxResourceSchema);
const syncRunListSchema = publicJsonSchema(
  PublicListResourceSchema(PublicMailboxSyncRunInspectionResourceSchema),
);
const mailboxObservabilitySchema = publicJsonSchema(
  PublicMailboxObservabilitySnapshotResourceSchema,
);
const replaySchema = publicJsonSchema(PublicReplayResourceSchema);
const messageSchema = publicJsonSchema(PublicMessageResourceSchema);
const messageListSchema = publicJsonSchema(PublicListResourceSchema(PublicMessageResourceSchema));
const threadListItemListSchema = publicJsonSchema(
  PublicListResourceSchema(PublicThreadListItemResourceSchema),
);
const threadSchema = publicJsonSchema(PublicThreadResourceSchema);
const problemResponse = (description: string) =>
  jsonResponse(description, publicJsonSchema(PublicProblemDetailsSchema));

const pathParameter = (name: string) => {
  return {
    in: "path",
    name,
    required: true,
    schema: { type: "string", minLength: 1 },
  } as const;
};

export const mailmonOpenApiOptions = {
  documentation: {
    openapi: "3.1.0",
    info: {
      title: "Mailmon API",
      version: "1.0.0",
    },
    servers: [
      {
        url: "https://api.mailmon.dev",
        description: "Production",
      },
      {
        url: "http://localhost:3000",
        description: "Local development",
      },
    ],
    security: [
      {
        bearerAuth: [],
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
        },
      },
    },
  },
} satisfies Partial<GenerateSpecOptions>;

const toCursorLimitParams = (query: CursorLimitQueryParams) => {
  return {
    cursor: query.cursor ?? null,
    limit: query.limit ?? DEFAULT_LIST_LIMIT,
  };
};

const toMailboxListParams = (query: MailboxListQueryParams) => {
  const mailboxId = query.mailboxId ?? query.mailbox_id;

  if (mailboxId === undefined) {
    throw new Error("Validated mailbox list query is missing a mailbox id.");
  }

  return {
    ...toCursorLimitParams(query),
    mailboxId,
  };
};

const toWebhookEndpointSubscriptionRequest = (request: CreateWebhookEndpointSubscriptionBody) => {
  return "mailboxIds" in request
    ? {
        mailboxIds: request.mailboxIds,
        eventTypes: request.eventTypes,
      }
    : {
        mailboxIds: request.mailbox_ids,
        eventTypes: request.event_types,
      };
};

const toReplayRequest = (request: CreateReplayBody) => {
  return "mailboxId" in request
    ? {
        mailboxId: request.mailboxId,
        webhookEndpointId: request.webhookEndpointId,
        startTime: request.startTime,
        endTime: request.endTime,
      }
    : {
        mailboxId: request.mailbox_id,
        webhookEndpointId: request.webhook_endpoint_id,
        startTime: request.start_time,
        endTime: request.end_time,
      };
};

export const createApp = (runtime: ApiServerRuntime) => {
  const app = new Hono();

  app.onError((error) => {
    if (error instanceof HTTPException && error.message === "Malformed JSON in request body") {
      return createProblemResponse(invalidRequest(INVALID_JSON_DETAIL));
    }

    throw error;
  });

  app.get("/health", (context) => {
    return context.json({ status: "ok" });
  });

  app.post(
    "/v1/mailboxes/connect-sessions",
    describeRoute({
      summary: "Create a mailbox connect session",
      responses: {
        201: jsonResponse("Connect session created", connectSessionSchema),
        400: problemResponse("Invalid request"),
      },
    }),
    validate("json", CreateConnectSessionBodySchema, INVALID_CONNECT_SESSION_BODY_DETAIL),
    async (context) => {
      const auth = await authenticateRequest(runtime, context.req.header("authorization"));

      if (auth.tag === "failure") {
        return createProblemResponse(auth.problem);
      }

      const request = context.req.valid("json");
      const result = await runProblemEffect(
        runtime,
        createMailboxConnectSession(
          auth.workspace.workspaceId,
          request,
          getRequestOrigin(context.req),
        ),
      );

      if (result.tag === "failure") {
        return createProblemResponse(result.problem);
      }

      return context.json(result.value, 201);
    },
  );

  app.post(
    "/v1/webhook-endpoints",
    describeRoute({
      summary: "Create a webhook endpoint",
      responses: {
        201: jsonResponse("Webhook endpoint created", createdWebhookEndpointSchema),
        400: problemResponse("Invalid request"),
      },
    }),
    validate("json", CreateWebhookEndpointBodySchema, INVALID_WEBHOOK_ENDPOINT_BODY_DETAIL),
    async (context) => {
      const auth = await authenticateRequest(runtime, context.req.header("authorization"));

      if (auth.tag === "failure") {
        return createProblemResponse(auth.problem);
      }

      const request = context.req.valid("json");
      const result = await runProblemEffect(
        runtime,
        createWebhookEndpoint(auth.workspace.workspaceId, {
          url: request.url,
          description: request.description ?? null,
        }),
      );

      if (result.tag === "failure") {
        return createProblemResponse(result.problem);
      }

      return context.json(result.value, 201);
    },
  );

  app.post(
    "/v1/webhook-endpoints/:endpointId/subscriptions",
    describeRoute({
      summary: "Create mailbox-scoped webhook subscriptions",
      responses: {
        201: jsonResponse("Webhook subscriptions created", webhookEndpointSubscriptionListSchema),
        400: problemResponse("Invalid request"),
        404: problemResponse("Mailbox or webhook endpoint not found"),
      },
    }),
    validate("json", CreateWebhookEndpointSubscriptionBodySchema, subscriptionBodyDetail),
    async (context) => {
      const auth = await authenticateRequest(runtime, context.req.header("authorization"));

      if (auth.tag === "failure") {
        return createProblemResponse(auth.problem);
      }

      const request = toWebhookEndpointSubscriptionRequest(context.req.valid("json"));
      const result = await runProblemEffect(
        runtime,
        createWebhookEndpointSubscription(
          auth.workspace.workspaceId,
          context.req.param("endpointId"),
          request,
        ),
      );

      if (result.tag === "failure") {
        return createProblemResponse(result.problem);
      }

      return context.json(result.value, 201);
    },
  );

  app.get(
    "/v1/mailboxes/:mailboxId",
    describeRoute({
      operationId: "getV1MailboxesByMailboxId",
      summary: "Get a mailbox",
      parameters: [pathParameter("mailboxId")],
      responses: {
        200: jsonResponse("Mailbox", mailboxSchema),
        400: problemResponse("Invalid request"),
        404: problemResponse("Mailbox not found"),
      },
    }),
    async (context) => {
      const auth = await authenticateRequest(runtime, context.req.header("authorization"));

      if (auth.tag === "failure") {
        return createProblemResponse(auth.problem);
      }

      const result = await runProblemEffect(
        runtime,
        getMailboxOrFail(context.req.param("mailboxId"), {
          workspaceId: auth.workspace.workspaceId,
        }),
      );

      if (result.tag === "failure") {
        return createProblemResponse(result.problem);
      }

      return context.json(result.value);
    },
  );

  app.get(
    "/v1/mailboxes/:mailboxId/sync-runs",
    describeRoute({
      summary: "List mailbox sync runs",
      responses: {
        200: jsonResponse("Mailbox sync runs", syncRunListSchema),
        400: problemResponse("Invalid request"),
      },
    }),
    validate("query", CursorLimitQuerySchema, INVALID_LIMIT_DETAIL),
    async (context) => {
      const auth = await authenticateRequest(runtime, context.req.header("authorization"));

      if (auth.tag === "failure") {
        return createProblemResponse(auth.problem);
      }

      const params = toCursorLimitParams(context.req.valid("query"));

      const result = await runProblemEffect(
        runtime,
        listMailboxSyncRuns(context.req.param("mailboxId"), {
          cursor: params.cursor,
          limit: params.limit,
          workspaceId: auth.workspace.workspaceId,
        }),
      );

      if (result.tag === "failure") {
        return createProblemResponse(result.problem);
      }

      return context.json(toSyncRunsResponse(result.value));
    },
  );

  app.get(
    "/v1/mailboxes/:mailboxId/observability",
    describeRoute({
      operationId: "getV1MailboxesByMailboxIdObservability",
      summary: "Get mailbox observability",
      parameters: [pathParameter("mailboxId")],
      responses: {
        200: jsonResponse("Mailbox observability", mailboxObservabilitySchema),
        400: problemResponse("Invalid request"),
        404: problemResponse("Mailbox not found"),
      },
    }),
    async (context) => {
      const auth = await authenticateRequest(runtime, context.req.header("authorization"));

      if (auth.tag === "failure") {
        return createProblemResponse(auth.problem);
      }

      const result = await runProblemEffect(
        runtime,
        getMailboxObservability(context.req.param("mailboxId"), {
          workspaceId: auth.workspace.workspaceId,
        }),
      );

      if (result.tag === "failure") {
        return createProblemResponse(result.problem);
      }

      return context.json(result.value);
    },
  );

  app.post(
    "/v1/replays",
    describeRoute({
      summary: "Create a mailbox event replay",
      responses: {
        201: jsonResponse("Replay created", replaySchema),
        400: problemResponse("Invalid request"),
        409: problemResponse("Overlapping active replay conflict"),
      },
    }),
    validate("json", CreateReplayBodySchema, INVALID_REPLAY_BODY_DETAIL),
    async (context) => {
      const auth = await authenticateRequest(runtime, context.req.header("authorization"));

      if (auth.tag === "failure") {
        return createProblemResponse(auth.problem);
      }

      const result = await runProblemEffect(
        runtime,
        createReplay(auth.workspace.workspaceId, toReplayRequest(context.req.valid("json"))),
      );

      if (result.tag === "failure") {
        return createProblemResponse(result.problem);
      }

      return context.json(result.value, 201);
    },
  );

  app.get(
    "/v1/replays/:replayId",
    describeRoute({
      operationId: "getV1ReplaysByReplayId",
      summary: "Get a replay",
      parameters: [pathParameter("replayId")],
      responses: {
        200: jsonResponse("Replay", replaySchema),
        400: problemResponse("Invalid request"),
        404: problemResponse("Replay not found"),
      },
    }),
    async (context) => {
      const auth = await authenticateRequest(runtime, context.req.header("authorization"));

      if (auth.tag === "failure") {
        return createProblemResponse(auth.problem);
      }

      const result = await runProblemEffect(
        runtime,
        getReplayOrFail(context.req.param("replayId"), {
          workspaceId: auth.workspace.workspaceId,
        }),
      );

      if (result.tag === "failure") {
        return createProblemResponse(result.problem);
      }

      return context.json(result.value);
    },
  );

  app.get(
    "/v1/messages",
    describeRoute({
      summary: "List mailbox messages",
      responses: {
        200: jsonResponse("Mailbox messages", messageListSchema),
        400: problemResponse("Invalid request"),
      },
    }),
    validate("query", MailboxListQuerySchema, mailboxListQueryDetail),
    async (context) => {
      const auth = await authenticateRequest(runtime, context.req.header("authorization"));

      if (auth.tag === "failure") {
        return createProblemResponse(auth.problem);
      }

      const params = toMailboxListParams(context.req.valid("query"));

      const result = await runProblemEffect(
        runtime,
        listMailboxMessages(params.mailboxId, {
          cursor: params.cursor,
          limit: params.limit,
          workspaceId: auth.workspace.workspaceId,
        }),
      );

      if (result.tag === "failure") {
        return createProblemResponse(result.problem);
      }

      return context.json(result.value);
    },
  );

  app.get(
    "/v1/messages/:messageId",
    describeRoute({
      operationId: "getV1MessagesByMessageId",
      summary: "Get a message",
      parameters: [pathParameter("messageId")],
      responses: {
        200: jsonResponse("Message", messageSchema),
        400: problemResponse("Invalid request"),
        404: problemResponse("Message not found"),
      },
    }),
    async (context) => {
      const auth = await authenticateRequest(runtime, context.req.header("authorization"));

      if (auth.tag === "failure") {
        return createProblemResponse(auth.problem);
      }

      const result = await runProblemEffect(
        runtime,
        getMessageOrFail(context.req.param("messageId"), {
          workspaceId: auth.workspace.workspaceId,
        }),
      );

      if (result.tag === "failure") {
        return createProblemResponse(result.problem);
      }

      return context.json(result.value);
    },
  );

  app.get(
    "/v1/threads",
    describeRoute({
      summary: "List mailbox threads",
      responses: {
        200: jsonResponse("Mailbox threads", threadListItemListSchema),
        400: problemResponse("Invalid request"),
      },
    }),
    validate("query", MailboxListQuerySchema, mailboxListQueryDetail),
    async (context) => {
      const auth = await authenticateRequest(runtime, context.req.header("authorization"));

      if (auth.tag === "failure") {
        return createProblemResponse(auth.problem);
      }

      const params = toMailboxListParams(context.req.valid("query"));

      const result = await runProblemEffect(
        runtime,
        listMailboxThreads(params.mailboxId, {
          cursor: params.cursor,
          limit: params.limit,
          workspaceId: auth.workspace.workspaceId,
        }),
      );

      if (result.tag === "failure") {
        return createProblemResponse(result.problem);
      }

      return context.json(result.value);
    },
  );

  app.get(
    "/v1/threads/:threadId",
    describeRoute({
      operationId: "getV1ThreadsByThreadId",
      summary: "Get a thread",
      parameters: [pathParameter("threadId")],
      responses: {
        200: jsonResponse("Thread", threadSchema),
        400: problemResponse("Invalid request"),
        404: problemResponse("Thread not found"),
      },
    }),
    async (context) => {
      const auth = await authenticateRequest(runtime, context.req.header("authorization"));

      if (auth.tag === "failure") {
        return createProblemResponse(auth.problem);
      }

      const result = await runProblemEffect(
        runtime,
        getThreadOrFail(context.req.param("threadId"), {
          workspaceId: auth.workspace.workspaceId,
        }),
      );

      if (result.tag === "failure") {
        return createProblemResponse(result.problem);
      }

      return context.json(result.value);
    },
  );

  app.get("/oauth/gmail/callback", async (context) => {
    const connectSessionId = context.req.query("state");

    if (connectSessionId === undefined || connectSessionId.length === 0) {
      return createProblemResponse(
        invalidRequest("OAuth callback is missing the connect session state."),
      );
    }

    const connectSessionResult = await runProblemEffect(
      runtime,
      getConnectSessionOrFail(connectSessionId),
    );

    if (connectSessionResult.tag === "failure") {
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

    const completion = await runProblemEffect(
      runtime,
      completeGmailMailboxConnectSession(connectSessionId, code, getRequestOrigin(context.req)),
    );

    if (completion.tag === "failure") {
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
    const result = await runProblemEffect(
      runtime,
      getGmailMailboxConnectAuthorizationUrl(
        context.req.param("connectSessionId"),
        getRequestOrigin(context.req),
      ),
    );

    if (result.tag === "failure") {
      return createProblemResponse(result.problem);
    }

    return Response.redirect(result.value, 302);
  });

  app.get("/openapi.json", openAPIRouteHandler(app, mailmonOpenApiOptions));

  return app;
};
