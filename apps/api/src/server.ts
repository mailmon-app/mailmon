import {
  completeGmailMailboxConnectSession,
  getConnectSessionOrFail,
  getGmailMailboxConnectAuthorizationUrl,
} from "@mailmon/core";
import { Effect } from "effect";
import { Hono } from "hono";
import { openAPIRouteHandler, type GenerateSpecOptions } from "hono-openapi";
import { HTTPException } from "hono/http-exception";

import { createProblemResponse, toHandlerResult, type ApiServerRuntime } from "./http/handlers.js";
import { INVALID_JSON_DETAIL, invalidRequest } from "./http/parsers.js";
import { getRequestOrigin } from "./http/route-runtime.js";
import { registerPublicRoutes } from "./http/route-specs.js";

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

const handleGmailOAuthCallbackEffect = Effect.fn("api.handleGmailOAuthCallback")(
  function* (request: {
    readonly code: string | undefined;
    readonly connectSessionId: string;
    readonly error: string | undefined;
    readonly errorDescription: string | undefined;
    readonly origin: string;
  }) {
    const connectSessionResult = yield* toHandlerResult(
      getConnectSessionOrFail(request.connectSessionId),
    );

    if (connectSessionResult.tag === "failure") {
      return createProblemResponse(connectSessionResult.problem);
    }

    const connectSession = connectSessionResult.value;

    if (request.error !== undefined) {
      return redirectToConnectResult(connectSession.redirectUrl, {
        code: request.error,
        detail: request.errorDescription ?? "The Gmail authorization flow was cancelled.",
        status: "error",
      });
    }

    if (request.code === undefined || request.code.length === 0) {
      return redirectToConnectResult(connectSession.redirectUrl, {
        code: "gmail_authorization_code_missing",
        status: "error",
      });
    }

    const completion = yield* toHandlerResult(
      completeGmailMailboxConnectSession(request.connectSessionId, request.code, request.origin),
    );

    if (completion.tag === "failure") {
      return redirectToConnectResult(connectSession.redirectUrl, {
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
  },
);

const handleHostedGmailConnectEffect = Effect.fn("api.handleHostedGmailConnect")(
  function* (request: { readonly connectSessionId: string; readonly origin: string }) {
    const result = yield* toHandlerResult(
      getGmailMailboxConnectAuthorizationUrl(request.connectSessionId, request.origin),
    );

    if (result.tag === "failure") {
      return createProblemResponse(result.problem);
    }

    return Response.redirect(result.value, 302);
  },
);

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

  registerPublicRoutes(app, runtime);

  app.get("/oauth/gmail/callback", async (context) => {
    const connectSessionId = context.req.query("state");

    if (connectSessionId === undefined || connectSessionId.length === 0) {
      return createProblemResponse(
        invalidRequest("OAuth callback is missing the connect session state."),
      );
    }

    return runtime.runPromise(
      handleGmailOAuthCallbackEffect({
        code: context.req.query("code"),
        connectSessionId,
        error: context.req.query("error"),
        errorDescription: context.req.query("error_description"),
        origin: getRequestOrigin(context.req),
      }),
    );
  });

  app.get("/oauth/gmail/:connectSessionId", async (context) => {
    return runtime.runPromise(
      handleHostedGmailConnectEffect({
        connectSessionId: context.req.param("connectSessionId"),
        origin: getRequestOrigin(context.req),
      }),
    );
  });

  app.get("/openapi.json", openAPIRouteHandler(app, mailmonOpenApiOptions));

  return app;
};
