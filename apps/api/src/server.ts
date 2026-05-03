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
  type MailboxSyncRunInspectionResource,
} from "@mailmon/core";
import { Hono } from "hono";
import { describeRoute, openAPIRouteHandler } from "hono-openapi";
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
import { mailboxListQueryDetail, subscriptionBodyDetail, validate } from "./http/validation.js";

const getRequestOrigin = (requestUrl: string) => {
  return new URL(requestUrl).origin;
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
        201: {
          description: "Connect session created",
        },
        400: {
          description: "Invalid request",
        },
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
          getRequestOrigin(context.req.url),
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
        201: {
          description: "Webhook endpoint created",
        },
        400: {
          description: "Invalid request",
        },
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
        201: {
          description: "Webhook subscriptions created",
        },
        400: {
          description: "Invalid request",
        },
        404: {
          description: "Mailbox or webhook endpoint not found",
        },
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

  app.get("/v1/mailboxes/:mailboxId", async (context) => {
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
  });

  app.get(
    "/v1/mailboxes/:mailboxId/sync-runs",
    describeRoute({
      summary: "List mailbox sync runs",
      responses: {
        200: {
          description: "Mailbox sync runs",
        },
        400: {
          description: "Invalid request",
        },
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

  app.get("/v1/mailboxes/:mailboxId/observability", async (context) => {
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
  });

  app.post(
    "/v1/replays",
    describeRoute({
      summary: "Create a mailbox event replay",
      responses: {
        201: {
          description: "Replay created",
        },
        400: {
          description: "Invalid request",
        },
        409: {
          description: "Overlapping active replay conflict",
        },
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

  app.get("/v1/replays/:replayId", async (context) => {
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
  });

  app.get(
    "/v1/messages",
    describeRoute({
      summary: "List mailbox messages",
      responses: {
        200: {
          description: "Mailbox messages",
        },
        400: {
          description: "Invalid request",
        },
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

  app.get("/v1/messages/:messageId", async (context) => {
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
  });

  app.get(
    "/v1/threads",
    describeRoute({
      summary: "List mailbox threads",
      responses: {
        200: {
          description: "Mailbox threads",
        },
        400: {
          description: "Invalid request",
        },
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

  app.get("/v1/threads/:threadId", async (context) => {
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
  });

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
      completeGmailMailboxConnectSession(connectSessionId, code, getRequestOrigin(context.req.url)),
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
        getRequestOrigin(context.req.url),
      ),
    );

    if (result.tag === "failure") {
      return createProblemResponse(result.problem);
    }

    return Response.redirect(result.value, 302);
  });

  app.get(
    "/openapi.json",
    openAPIRouteHandler(app, {
      documentation: {
        openapi: "3.1.0",
        info: {
          title: "Mailmon API",
          version: "1.0.0",
        },
      },
    }),
  );

  return app;
};
