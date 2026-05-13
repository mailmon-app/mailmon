import {
  completeGmailMailboxConnectSession,
  getConnectSessionOrFail,
  getGmailMailboxConnectAuthorizationUrl,
} from "@mailmon/core";
import { Hono } from "hono";
import { openAPIRouteHandler, type GenerateSpecOptions } from "hono-openapi";
import { HTTPException } from "hono/http-exception";

import { createProblemResponse, runProblemEffect, type ApiServerRuntime } from "./http/handlers.js";
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
