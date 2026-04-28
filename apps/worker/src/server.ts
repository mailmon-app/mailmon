import { serve } from "@hono/node-server";
import type { ServerType } from "@hono/node-server";
import type { AsyncTransportMode } from "@mailmon/config";
import type {
  ControlJobDispatchRequest,
  ControlJobRunResult,
  GmailPushNotification,
  GmailPushNotificationResult,
  MailboxSyncJobData,
  ProblemDetails,
  ProcessWebhookDeliveryResult,
  SyncMailboxResult,
  WebhookDeliveryScheduleRequest,
} from "@mailmon/core";
import { Context, Layer, ManagedRuntime } from "effect";
import { OAuth2Client } from "google-auth-library";
import { Hono } from "hono";

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

interface WorkerHttpRuntimeOptions {
  readonly host: string;
  readonly port: number;
  readonly asyncTransportMode: AsyncTransportMode;
  readonly internalAuth?: WorkerInternalAuthOptions;
  readonly processGmailPushNotification: (
    notification: GmailPushNotification,
  ) => Promise<GmailPushNotificationResult>;
  readonly processControlJob: (request: ControlJobDispatchRequest) => Promise<ControlJobRunResult>;
  readonly processSyncJob: (job: MailboxSyncJobData) => Promise<SyncMailboxResult>;
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

class WorkerHttpProcessors extends Context.Tag("@mailmon/worker/WorkerHttpProcessors")<
  WorkerHttpProcessors,
  Pick<
    WorkerHttpRuntimeOptions,
    | "processControlJob"
    | "processGmailPushNotification"
    | "processSyncJob"
    | "processWebhookDelivery"
  >
>() {}

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

const readJsonRequest = async (request: { readonly text: () => Promise<string> }) => {
  const body = await request.text();

  if (body.length === 0) {
    return null;
  }

  return JSON.parse(body) as unknown;
};

const isMailboxSyncJobData = (value: unknown): value is MailboxSyncJobData => {
  return (
    typeof value === "object" &&
    value !== null &&
    "mailboxId" in value &&
    typeof value.mailboxId === "string" &&
    value.mailboxId.length > 0
  );
};

const isWebhookDeliveryScheduleRequest = (
  value: unknown,
): value is WebhookDeliveryScheduleRequest => {
  return (
    typeof value === "object" &&
    value !== null &&
    "deliveryId" in value &&
    "notBefore" in value &&
    typeof value.deliveryId === "string" &&
    value.deliveryId.length > 0 &&
    typeof value.notBefore === "string" &&
    value.notBefore.length > 0
  );
};

const isControlJobDispatchRequest = (value: unknown): value is ControlJobDispatchRequest => {
  return (
    typeof value === "object" &&
    value !== null &&
    "kind" in value &&
    (value.kind === "renew_watches" ||
      value.kind === "dispatch_replays" ||
      value.kind === "repair_mailboxes" ||
      value.kind === "recover_stuck_syncs" ||
      value.kind === "cleanup")
  );
};

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> => {
  return typeof value === "object" && value !== null;
};

const decodeBase64Json = (encoded: string): unknown => {
  return JSON.parse(Buffer.from(encoded, "base64").toString("utf8")) as unknown;
};

const parseGmailPushNotification = (
  payload: unknown,
): { readonly notification: GmailPushNotification } | { readonly error: string } => {
  if (!isRecord(payload) || !isRecord(payload.message)) {
    return {
      error: "Expected a Pub/Sub push envelope with a message object.",
    };
  }

  const message = payload.message;

  if (typeof message.data !== "string" || message.data.length === 0) {
    return {
      error: "Expected Pub/Sub message.data to contain a base64-encoded Gmail notification.",
    };
  }

  try {
    const decoded = decodeBase64Json(message.data);

    if (
      !isRecord(decoded) ||
      typeof decoded.emailAddress !== "string" ||
      decoded.emailAddress.length === 0 ||
      typeof decoded.historyId !== "string" ||
      decoded.historyId.length === 0
    ) {
      return {
        error:
          "Expected Gmail notification data to include non-empty emailAddress and historyId fields.",
      };
    }

    return {
      notification: {
        emailAddress: decoded.emailAddress,
        historyId: decoded.historyId,
        messageId:
          typeof message.messageId === "string" && message.messageId.length > 0
            ? message.messageId
            : null,
        subscription:
          typeof payload.subscription === "string" && payload.subscription.length > 0
            ? payload.subscription
            : null,
      },
    };
  } catch {
    return {
      error: "Pub/Sub message.data was not valid base64-encoded JSON.",
    };
  }
};

const parseMailboxSyncRequest = (
  payload: unknown,
): { readonly job: MailboxSyncJobData } | { readonly error: string } => {
  if (isMailboxSyncJobData(payload)) {
    return {
      job: payload,
    };
  }

  if (!isRecord(payload) || !isRecord(payload.message)) {
    return {
      error: "Expected a mailbox-scoped sync payload or a Pub/Sub push envelope.",
    };
  }

  const message = payload.message;

  if (typeof message.data !== "string" || message.data.length === 0) {
    return {
      error: "Expected Pub/Sub message.data to contain a base64-encoded mailbox sync payload.",
    };
  }

  try {
    const decoded = decodeBase64Json(message.data);

    if (!isMailboxSyncJobData(decoded)) {
      return {
        error: "Expected mailbox sync data to include a non-empty mailboxId field.",
      };
    }

    return {
      job: decoded,
    };
  } catch {
    return {
      error: "Pub/Sub message.data was not valid base64-encoded JSON.",
    };
  }
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

const isProblemDetails = (value: unknown): value is ProblemDetails => {
  return (
    typeof value === "object" &&
    value !== null &&
    "code" in value &&
    "detail" in value &&
    "status" in value &&
    typeof value.code === "string" &&
    typeof value.detail === "string" &&
    typeof value.status === "number"
  );
};

const createJsonResponse = (body: unknown, status: number) => {
  return new Response(JSON.stringify(body), {
    headers: {
      "content-type": "application/json",
    },
    status,
  });
};

const createWorkerInternalErrorResponse = (detail: string) => {
  return createJsonResponse(
    {
      code: "worker_internal_error",
      detail,
    },
    500,
  );
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

type WorkerHttpServerRuntime = Pick<
  ManagedRuntime.ManagedRuntime<WorkerHttpProcessors, never>,
  "runPromise"
>;

const getWorkerHttpProcessors = (runtime: WorkerHttpServerRuntime) => {
  return runtime.runPromise(WorkerHttpProcessors);
};

export const createWorkerApp = (
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

  app.post("/internal/sync", async (context) => {
    try {
      const payload = await readJsonRequest(context.req);
      const parsed = parseMailboxSyncRequest(payload);

      if ("error" in parsed) {
        return createJsonResponse(
          {
            code: "invalid_mailbox_sync_request",
            detail: parsed.error,
          },
          400,
        );
      }

      const processors = await getWorkerHttpProcessors(runtime);
      const result = await processors.processSyncJob(parsed.job);

      return context.json(result);
    } catch (error) {
      if (isProblemDetails(error)) {
        return createJsonResponse(error, error.status);
      }

      return createWorkerInternalErrorResponse(
        "The worker failed while processing the sync request.",
      );
    }
  });

  app.post("/internal/gmail-push", async (context) => {
    if (options.asyncTransportMode === "local") {
      return context.json(
        {
          status: "accepted",
          detail:
            "Local mode accepts Gmail push wake-ups, but direct sync dispatch should use /internal/sync.",
        },
        202,
      );
    }

    try {
      const payload = await readJsonRequest(context.req);
      const parsed = parseGmailPushNotification(payload);

      if ("error" in parsed) {
        return createJsonResponse(
          {
            code: "invalid_gmail_push_request",
            detail: parsed.error,
          },
          400,
        );
      }

      const processors = await getWorkerHttpProcessors(runtime);
      const result = await processors.processGmailPushNotification(parsed.notification);

      return context.json(result, 202);
    } catch (error) {
      if (isProblemDetails(error)) {
        return createJsonResponse(error, error.status);
      }

      return createWorkerInternalErrorResponse(
        "The worker failed while processing the Gmail push request.",
      );
    }
  });

  app.post("/internal/webhook-deliveries", async (context) => {
    try {
      const payload = await readJsonRequest(context.req);

      if (!isWebhookDeliveryScheduleRequest(payload)) {
        return createJsonResponse(
          {
            code: "invalid_webhook_delivery_request",
            detail:
              "Expected a webhook delivery payload with non-empty deliveryId and notBefore fields.",
          },
          400,
        );
      }

      const processors = await getWorkerHttpProcessors(runtime);
      const result = await processors.processWebhookDelivery(payload);

      return context.json(result);
    } catch (error) {
      if (isProblemDetails(error)) {
        return createJsonResponse(error, error.status);
      }

      return createWorkerInternalErrorResponse(
        "The worker failed while processing the webhook delivery request.",
      );
    }
  });

  app.post("/internal/control-jobs", async (context) => {
    try {
      const payload = await readJsonRequest(context.req);

      if (!isControlJobDispatchRequest(payload)) {
        return createJsonResponse(
          {
            code: "invalid_control_job_request",
            detail: "Expected a control job payload with a supported kind.",
          },
          400,
        );
      }

      const processors = await getWorkerHttpProcessors(runtime);
      const result = await processors.processControlJob(payload);

      return context.json(result);
    } catch (error) {
      if (isProblemDetails(error)) {
        return createJsonResponse(error, error.status);
      }

      return createWorkerInternalErrorResponse(
        "The worker failed while processing the control job request.",
      );
    }
  });

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
