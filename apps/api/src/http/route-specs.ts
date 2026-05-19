import {
  createMailboxConnectSession,
  createReplay,
  createWebhookEndpoint,
  createWebhookEndpointSubscription,
  getMailboxObservability,
  getMailboxOrFail,
  getMessageOrFail,
  getReplayOrFail,
  getThreadOrFail,
  listMailboxMessages,
  listMailboxSyncRuns,
  listMailboxThreads,
  type MailboxSyncRunInspectionResource,
} from "@mailmon/core";
import { Effect } from "effect";
import type { Hono } from "hono";
import { describeRoute } from "hono-openapi";

import type { ApiServerRuntime } from "./handlers.js";
import {
  connectSessionSchema,
  createdWebhookEndpointSchema,
  jsonResponse,
  mailboxObservabilitySchema,
  mailboxSchema,
  messageListSchema,
  messageSchema,
  pathParameter,
  problemResponse,
  replaySchema,
  syncRunListSchema,
  threadListItemListSchema,
  threadSchema,
  webhookEndpointSubscriptionListSchema,
} from "./openapi-responses.js";
import {
  CreateConnectSessionBodySchema,
  CreateReplayBodySchema,
  CreateWebhookEndpointBodySchema,
  CreateWebhookEndpointSubscriptionBodySchema,
  CursorLimitQuerySchema,
  DEFAULT_LIST_LIMIT,
  INVALID_CONNECT_SESSION_BODY_DETAIL,
  INVALID_LIMIT_DETAIL,
  INVALID_REPLAY_BODY_DETAIL,
  INVALID_WEBHOOK_ENDPOINT_BODY_DETAIL,
  MailboxListQuerySchema,
  type CreateReplayBody,
  type CreateWebhookEndpointSubscriptionBody,
  type CursorLimitQueryParams,
  type MailboxListQueryParams,
} from "./parsers.js";
import {
  createAuthenticatedRouteHandler,
  pathParam,
  validatedJson,
  validatedQuery,
} from "./route-runtime.js";
import { mailboxListQueryDetail, subscriptionBodyDetail, validate } from "./validation.js";

type CreateConnectSessionBody = typeof CreateConnectSessionBodySchema.Type;
type CreateWebhookEndpointBody = typeof CreateWebhookEndpointBodySchema.Type;

const toCursorLimitParams = (query: CursorLimitQueryParams) => {
  return {
    cursor: query.cursor ?? null,
    limit: query.limit ?? DEFAULT_LIST_LIMIT,
  };
};

const toMailboxListParams = Effect.fn("api.toMailboxListParams")(function* (
  query: MailboxListQueryParams,
) {
  const mailboxId = query.mailboxId ?? query.mailbox_id;

  if (mailboxId === undefined) {
    return yield* Effect.die(new Error("Validated mailbox list query is missing a mailbox id."));
  }

  return {
    ...toCursorLimitParams(query),
    mailboxId,
  };
});

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

export const registerPublicRoutes = (app: Hono, runtime: ApiServerRuntime) => {
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
    createAuthenticatedRouteHandler(
      runtime,
      ({ context, origin, workspace }) =>
        createMailboxConnectSession(
          workspace.workspaceId,
          validatedJson<CreateConnectSessionBody>(context),
          origin,
        ),
      { successStatus: 201 },
    ),
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
    createAuthenticatedRouteHandler(
      runtime,
      ({ context, workspace }) => {
        const request = validatedJson<CreateWebhookEndpointBody>(context);

        return createWebhookEndpoint(workspace.workspaceId, {
          url: request.url,
          description: request.description ?? null,
        });
      },
      { successStatus: 201 },
    ),
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
    createAuthenticatedRouteHandler(
      runtime,
      ({ context, workspace }) =>
        Effect.gen(function* () {
          const endpointId = yield* pathParam(context, "endpointId");

          return yield* createWebhookEndpointSubscription(
            workspace.workspaceId,
            endpointId,
            toWebhookEndpointSubscriptionRequest(
              validatedJson<CreateWebhookEndpointSubscriptionBody>(context),
            ),
          );
        }),
      { successStatus: 201 },
    ),
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
    createAuthenticatedRouteHandler(runtime, ({ context, workspace }) =>
      Effect.gen(function* () {
        const mailboxId = yield* pathParam(context, "mailboxId");

        return yield* getMailboxOrFail(mailboxId, {
          workspaceId: workspace.workspaceId,
        });
      }),
    ),
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
    createAuthenticatedRouteHandler(
      runtime,
      ({ context, workspace }) =>
        Effect.gen(function* () {
          const mailboxId = yield* pathParam(context, "mailboxId");
          const params = toCursorLimitParams(validatedQuery<CursorLimitQueryParams>(context));

          return yield* listMailboxSyncRuns(mailboxId, {
            cursor: params.cursor,
            limit: params.limit,
            workspaceId: workspace.workspaceId,
          });
        }),
      { mapResponse: toSyncRunsResponse },
    ),
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
    createAuthenticatedRouteHandler(runtime, ({ context, workspace }) =>
      Effect.gen(function* () {
        const mailboxId = yield* pathParam(context, "mailboxId");

        return yield* getMailboxObservability(mailboxId, {
          workspaceId: workspace.workspaceId,
        });
      }),
    ),
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
    createAuthenticatedRouteHandler(
      runtime,
      ({ context, workspace }) =>
        createReplay(
          workspace.workspaceId,
          toReplayRequest(validatedJson<CreateReplayBody>(context)),
        ),
      { successStatus: 201 },
    ),
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
    createAuthenticatedRouteHandler(runtime, ({ context, workspace }) =>
      Effect.gen(function* () {
        const replayId = yield* pathParam(context, "replayId");

        return yield* getReplayOrFail(replayId, {
          workspaceId: workspace.workspaceId,
        });
      }),
    ),
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
    createAuthenticatedRouteHandler(runtime, ({ context, workspace }) =>
      Effect.gen(function* () {
        const params = yield* toMailboxListParams(validatedQuery<MailboxListQueryParams>(context));

        return yield* listMailboxMessages(params.mailboxId, {
          cursor: params.cursor,
          limit: params.limit,
          workspaceId: workspace.workspaceId,
        });
      }),
    ),
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
    createAuthenticatedRouteHandler(runtime, ({ context, workspace }) =>
      Effect.gen(function* () {
        const messageId = yield* pathParam(context, "messageId");

        return yield* getMessageOrFail(messageId, {
          workspaceId: workspace.workspaceId,
        });
      }),
    ),
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
    createAuthenticatedRouteHandler(runtime, ({ context, workspace }) =>
      Effect.gen(function* () {
        const params = yield* toMailboxListParams(validatedQuery<MailboxListQueryParams>(context));

        return yield* listMailboxThreads(params.mailboxId, {
          cursor: params.cursor,
          limit: params.limit,
          workspaceId: workspace.workspaceId,
        });
      }),
    ),
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
    createAuthenticatedRouteHandler(runtime, ({ context, workspace }) =>
      Effect.gen(function* () {
        const threadId = yield* pathParam(context, "threadId");

        return yield* getThreadOrFail(threadId, {
          workspaceId: workspace.workspaceId,
        });
      }),
    ),
  );
};
