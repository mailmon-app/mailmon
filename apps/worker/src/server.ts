import { serve } from "@hono/node-server";
import type { ServerType } from "@hono/node-server";
import type { AsyncTransportMode } from "@mailmon/config";
import {
  decodeControlJobDispatchRequest,
  decodeGmailPushNotificationPubSubEnvelope,
  decodeMailboxSyncDeadLetterRequest,
  decodeMailboxSyncWorkerRequest,
  decodeWebhookDeliveryScheduleRequest,
  type ControlJobDispatchRequest,
  type ControlJobRunResult,
  type GmailPushNotification,
  type GmailPushNotificationResult,
  type MailboxSyncDispatchExhaustedResult,
  type MailboxSyncJobData,
  type ProcessWebhookDeliveryResult,
  type SyncMailboxResult,
  type WebhookDeliveryScheduleRequest,
} from "@mailmon/core";
import { Layer, ManagedRuntime } from "effect";
import { OAuth2Client } from "google-auth-library";
import { Hono } from "hono";

import {
  createJsonResponse,
  interpretInternalRoute,
  WorkerHttpProcessors,
  type InternalRouteSpec,
  type WorkerHttpServerRuntime,
} from "./internal-route-interpreter.js";

interface VerifiedGoogleOidcToken {
  readonly audience: string | ReadonlyArray<string>;
  readonly email: string | null;
  readonly emailVerified: boolean | null;
  readonly issuer: string | null;
}

interface GoogleOidcVerifier {
  readonly verify: (idToken: string, audience: string) => Promise<VerifiedGoogleOidcToken | null>;
}

interface WorkerInternalAuthOptions {
  readonly allowedServiceAccountEmails: ReadonlyArray<string>;
  readonly audience: string;
  readonly verifier?: GoogleOidcVerifier;
}

export interface WorkerHttpRuntimeOptions {
  readonly host: string;
  readonly port: number;
  readonly asyncTransportMode: AsyncTransportMode;
  readonly internalAuth?: WorkerInternalAuthOptions;
  readonly processGmailPushNotification: (
    notification: GmailPushNotification,
  ) => Promise<GmailPushNotificationResult>;
  readonly processControlJob: (request: ControlJobDispatchRequest) => Promise<ControlJobRunResult>;
  readonly processSyncJob: (job: MailboxSyncJobData) => Promise<SyncMailboxResult>;
  readonly processMailboxSyncDeadLetter?: (
    job: MailboxSyncJobData,
  ) => Promise<MailboxSyncDispatchExhaustedResult>;
  readonly processWebhookDelivery: (
    request: WebhookDeliveryScheduleRequest,
  ) => Promise<ProcessWebhookDeliveryResult>;
}

interface WorkerHttpRuntimeHandle {
  readonly close: () => Promise<void>;
  readonly host: string;
  readonly port: number;
  readonly transport: "http";
}

type InternalAuthResult =
  | {
      readonly authorized: true;
    }
  | {
      readonly authorized: false;
      readonly body: {
        readonly code: string;
        readonly detail: string;
      };
      readonly statusCode: number;
    };

const googleOidcClient = new OAuth2Client();
const GOOGLE_OIDC_ISSUERS = new Set(["https://accounts.google.com", "accounts.google.com"]);

const createGoogleOidcVerifier = (): GoogleOidcVerifier => {
  return {
    verify: async (idToken, audience) => {
      const ticket = await googleOidcClient.verifyIdToken({
        audience,
        idToken,
      });
      const payload = ticket.getPayload();

      if (payload === undefined) {
        return null;
      }

      return {
        audience: payload.aud,
        email: payload.email ?? null,
        emailVerified: payload.email_verified ?? null,
        issuer: payload.iss ?? null,
      };
    },
  };
};

const logInvalidMailboxSyncDeadLetter = (detail: string) => {
  console.log(
    JSON.stringify({
      event: "mailbox_sync_dispatch_dead_letter_invalid",
      detail,
      occurredAt: new Date().toISOString(),
    }),
  );
};

const extractBearerToken = (authorizationHeader: string | undefined) => {
  if (authorizationHeader === undefined) {
    return null;
  }

  const [scheme, token, extra] = authorizationHeader.split(" ");

  if (scheme !== "Bearer" || token === undefined || token.length === 0 || extra !== undefined) {
    return null;
  }

  return token;
};

const tokenAudienceMatches = (
  actualAudience: string | ReadonlyArray<string>,
  expectedAudience: string,
) => {
  return Array.isArray(actualAudience)
    ? actualAudience.includes(expectedAudience)
    : actualAudience === expectedAudience;
};

const normalizeEmail = (email: string) => email.toLowerCase();

const authorizeInternalRequest = async (
  authorizationHeader: string | undefined,
  options: Pick<WorkerHttpRuntimeOptions, "asyncTransportMode" | "internalAuth">,
): Promise<InternalAuthResult> => {
  if (options.asyncTransportMode === "local") {
    return {
      authorized: true,
    };
  }

  if (options.internalAuth === undefined) {
    return {
      authorized: false,
      body: {
        code: "worker_internal_auth_not_configured",
        detail: "Internal worker authentication is not configured.",
      },
      statusCode: 500,
    };
  }

  const token = extractBearerToken(authorizationHeader);

  if (token === null) {
    return {
      authorized: false,
      body: {
        code: "worker_internal_auth_required",
        detail: "Internal worker requests must include Authorization: Bearer <google_oidc_token>.",
      },
      statusCode: 401,
    };
  }

  const verifier = options.internalAuth.verifier ?? createGoogleOidcVerifier();
  let verifiedToken: VerifiedGoogleOidcToken | null;

  try {
    verifiedToken = await verifier.verify(token, options.internalAuth.audience);
  } catch {
    return {
      authorized: false,
      body: {
        code: "worker_internal_auth_invalid",
        detail: "The internal worker authorization token is invalid.",
      },
      statusCode: 401,
    };
  }

  if (verifiedToken === null) {
    return {
      authorized: false,
      body: {
        code: "worker_internal_auth_invalid",
        detail: "The internal worker authorization token is invalid.",
      },
      statusCode: 401,
    };
  }

  if (
    verifiedToken.issuer === null ||
    !GOOGLE_OIDC_ISSUERS.has(verifiedToken.issuer) ||
    !tokenAudienceMatches(verifiedToken.audience, options.internalAuth.audience)
  ) {
    return {
      authorized: false,
      body: {
        code: "worker_internal_auth_forbidden",
        detail: "The internal worker authorization token is not trusted for this worker.",
      },
      statusCode: 403,
    };
  }

  if (verifiedToken.email === null || verifiedToken.emailVerified === false) {
    return {
      authorized: false,
      body: {
        code: "worker_internal_auth_forbidden",
        detail: "The internal worker authorization token is missing a verified service account.",
      },
      statusCode: 403,
    };
  }

  const allowedEmails = new Set(
    options.internalAuth.allowedServiceAccountEmails.map((email) => normalizeEmail(email)),
  );

  if (!allowedEmails.has(normalizeEmail(verifiedToken.email))) {
    return {
      authorized: false,
      body: {
        code: "worker_internal_auth_forbidden",
        detail:
          "The internal worker authorization token was issued for an unauthorized service account.",
      },
      statusCode: 403,
    };
  }

  return {
    authorized: true,
  };
};

const closeServer = (server: ServerType) => {
  return new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        if ("code" in error && error.code === "ERR_SERVER_NOT_RUNNING") {
          resolve();
          return;
        }

        reject(error);
        return;
      }

      resolve();
    });
  });
};

const createWorkerApp = (
  options: Pick<WorkerHttpRuntimeOptions, "asyncTransportMode" | "internalAuth">,
  runtime: WorkerHttpServerRuntime,
) => {
  const app = new Hono();

  app.get("/health", (context) => {
    return context.json({
      status: "ok",
      transportMode: options.asyncTransportMode,
    });
  });

  app.use("/internal/*", async (context, next) => {
    const authResult = await authorizeInternalRequest(context.req.header("authorization"), options);

    if (!authResult.authorized) {
      return createJsonResponse(authResult.body, authResult.statusCode);
    }

    return next();
  });

  const syncRouteSpec: InternalRouteSpec<MailboxSyncJobData, SyncMailboxResult> = {
    decode: decodeMailboxSyncWorkerRequest,
    internalErrorDetail: "The worker failed while processing the sync request.",
    invalidRequest: (detail) =>
      createJsonResponse(
        {
          code: "invalid_mailbox_sync_request",
          detail,
        },
        400,
      ),
    selectProcessor: (processors) => processors.processSyncJob,
  };

  const syncDeadLetterRouteSpec: InternalRouteSpec<
    MailboxSyncJobData,
    MailboxSyncDispatchExhaustedResult
  > = {
    decode: decodeMailboxSyncDeadLetterRequest,
    internalErrorDetail: "The worker failed while processing the sync dead-letter request.",
    invalidRequest: (detail) => {
      logInvalidMailboxSyncDeadLetter(detail);

      return createJsonResponse(
        {
          status: "accepted",
          detail,
        },
        200,
      );
    },
    problemStatus: (problem) => (problem.status >= 500 ? problem.status : 500),
    selectProcessor: (processors) => processors.processMailboxSyncDeadLetter,
  };

  const gmailPushRouteSpec: InternalRouteSpec<GmailPushNotification, GmailPushNotificationResult> =
    {
      decode: decodeGmailPushNotificationPubSubEnvelope,
      internalErrorDetail: "The worker failed while processing the Gmail push request.",
      invalidRequest: (detail) =>
        createJsonResponse(
          {
            code: "invalid_gmail_push_request",
            detail,
          },
          400,
        ),
      precondition: () =>
        options.asyncTransportMode === "local"
          ? createJsonResponse(
              {
                status: "accepted",
                detail:
                  "Local mode accepts Gmail push wake-ups, but direct sync dispatch should use /internal/sync.",
              },
              202,
            )
          : null,
      selectProcessor: (processors) => processors.processGmailPushNotification,
      successStatus: 202,
    };

  const webhookDeliveryRouteSpec: InternalRouteSpec<
    WebhookDeliveryScheduleRequest,
    ProcessWebhookDeliveryResult
  > = {
    decode: decodeWebhookDeliveryScheduleRequest,
    internalErrorDetail: "The worker failed while processing the webhook delivery request.",
    invalidRequest: (detail) =>
      createJsonResponse(
        {
          code: "invalid_webhook_delivery_request",
          detail,
        },
        400,
      ),
    selectProcessor: (processors) => processors.processWebhookDelivery,
  };

  const controlJobRouteSpec: InternalRouteSpec<ControlJobDispatchRequest, ControlJobRunResult> = {
    decode: decodeControlJobDispatchRequest,
    internalErrorDetail: "The worker failed while processing the control job request.",
    invalidRequest: (detail) =>
      createJsonResponse(
        {
          code: "invalid_control_job_request",
          detail,
        },
        400,
      ),
    selectProcessor: (processors) => processors.processControlJob,
  };

  app.post("/internal/sync", (context) =>
    interpretInternalRoute(syncRouteSpec, runtime)(context.req),
  );

  app.post("/internal/sync-dead-letter", (context) =>
    interpretInternalRoute(syncDeadLetterRouteSpec, runtime)(context.req),
  );

  app.post("/internal/gmail-push", (context) =>
    interpretInternalRoute(gmailPushRouteSpec, runtime)(context.req),
  );

  app.post("/internal/webhook-deliveries", (context) =>
    interpretInternalRoute(webhookDeliveryRouteSpec, runtime)(context.req),
  );

  app.post("/internal/control-jobs", (context) =>
    interpretInternalRoute(controlJobRouteSpec, runtime)(context.req),
  );

  app.notFound(() => {
    return createJsonResponse(
      {
        code: "worker_route_not_found",
        detail: "The worker route does not exist.",
      },
      404,
    );
  });

  return app;
};

export const startWorkerHttpRuntime = async (
  options: WorkerHttpRuntimeOptions,
): Promise<WorkerHttpRuntimeHandle> => {
  if (options.asyncTransportMode !== "local" && options.internalAuth === undefined) {
    throw new Error("Internal worker authentication is required outside local mode.");
  }

  const runtime = ManagedRuntime.make(
    Layer.succeed(WorkerHttpProcessors, {
      processControlJob: options.processControlJob,
      processGmailPushNotification: options.processGmailPushNotification,
      processMailboxSyncDeadLetter:
        options.processMailboxSyncDeadLetter ??
        (async ({ mailboxId }) => ({
          mailboxId,
          status: "mailbox_not_found" as const,
          syncRunId: null,
          recordedAt: new Date().toISOString(),
          detail: "mailbox_not_found" as const,
        })),
      processSyncJob: options.processSyncJob,
      processWebhookDelivery: options.processWebhookDelivery,
    }),
  );
  const app = createWorkerApp(options, runtime);

  const { port, server } = await new Promise<{
    readonly port: number;
    readonly server: ServerType;
  }>((resolve, reject) => {
    const serverHandle = serve(
      {
        fetch: app.fetch,
        hostname: options.host,
        port: options.port,
      },
      (info) => {
        serverHandle.removeListener("error", reject);
        resolve({
          port: info.port,
          server: serverHandle,
        });
      },
    );

    serverHandle.once("error", reject);
  });

  return {
    close: async () => {
      await closeServer(server);
      await runtime.dispose();
    },
    host: options.host,
    port,
    transport: "http",
  };
};
