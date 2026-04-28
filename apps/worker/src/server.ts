import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";

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
import { OAuth2Client } from "google-auth-library";

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

const readJsonBody = async (request: IncomingMessage) => {
  const chunks: Array<Buffer> = [];

  for await (const chunk of request) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }

  if (chunks.length === 0) {
    return null;
  }

  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
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

const sendJson = (response: ServerResponse, statusCode: number, body: unknown) => {
  response.writeHead(statusCode, {
    "content-type": "application/json",
  });
  response.end(JSON.stringify(body));
};

const isInternalRoute = (request: IncomingMessage) => {
  return typeof request.url === "string" && request.url.startsWith("/internal/");
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
  request: IncomingMessage,
  options: WorkerHttpRuntimeOptions,
): Promise<InternalAuthResult> => {
  if (!isInternalRoute(request) || options.asyncTransportMode === "local") {
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

  const token = extractBearerToken(request.headers.authorization);

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

const closeServer = (server: Server) => {
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

const listenServer = (server: Server, host: string, port: number) => {
  return new Promise<number>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      const address = server.address();

      server.removeListener("error", reject);

      if (address === null || typeof address === "string") {
        resolve(port);
        return;
      }

      resolve(address.port);
    });
  });
};

export const startWorkerHttpRuntime = async (
  options: WorkerHttpRuntimeOptions,
): Promise<WorkerHttpRuntimeHandle> => {
  if (options.asyncTransportMode !== "local" && options.internalAuth === undefined) {
    throw new Error("Internal worker authentication is required outside local mode.");
  }

  const handleRequest = async (request: IncomingMessage, response: ServerResponse) => {
    if (request.method === "GET" && request.url === "/health") {
      sendJson(response, 200, {
        status: "ok",
        transportMode: options.asyncTransportMode,
      });
      return;
    }

    const authResult = await authorizeInternalRequest(request, options);

    if (!authResult.authorized) {
      sendJson(response, authResult.statusCode, authResult.body);
      return;
    }

    if (request.method === "POST" && request.url === "/internal/sync") {
      try {
        const payload = await readJsonBody(request);
        const parsed = parseMailboxSyncRequest(payload);

        if ("error" in parsed) {
          sendJson(response, 400, {
            code: "invalid_mailbox_sync_request",
            detail: parsed.error,
          });
          return;
        }

        const result = await options.processSyncJob(parsed.job);
        sendJson(response, 200, result);
      } catch (error) {
        if (isProblemDetails(error)) {
          sendJson(response, error.status, error);
          return;
        }

        sendJson(response, 500, {
          code: "worker_internal_error",
          detail: "The worker failed while processing the sync request.",
        });
      }
      return;
    }

    if (request.method === "POST" && request.url === "/internal/gmail-push") {
      if (options.asyncTransportMode === "local") {
        sendJson(response, 202, {
          status: "accepted",
          detail:
            "Local mode accepts Gmail push wake-ups, but direct sync dispatch should use /internal/sync.",
        });
        return;
      }

      try {
        const payload = await readJsonBody(request);
        const parsed = parseGmailPushNotification(payload);

        if ("error" in parsed) {
          sendJson(response, 400, {
            code: "invalid_gmail_push_request",
            detail: parsed.error,
          });
          return;
        }

        const result = await options.processGmailPushNotification(parsed.notification);
        sendJson(response, 202, result);
      } catch (error) {
        if (isProblemDetails(error)) {
          sendJson(response, error.status, error);
          return;
        }

        sendJson(response, 500, {
          code: "worker_internal_error",
          detail: "The worker failed while processing the Gmail push request.",
        });
      }
      return;
    }

    if (request.method === "POST" && request.url === "/internal/webhook-deliveries") {
      try {
        const payload = await readJsonBody(request);

        if (!isWebhookDeliveryScheduleRequest(payload)) {
          sendJson(response, 400, {
            code: "invalid_webhook_delivery_request",
            detail:
              "Expected a webhook delivery payload with non-empty deliveryId and notBefore fields.",
          });
          return;
        }

        const result = await options.processWebhookDelivery(payload);
        sendJson(response, 200, result);
      } catch (error) {
        if (isProblemDetails(error)) {
          sendJson(response, error.status, error);
          return;
        }

        sendJson(response, 500, {
          code: "worker_internal_error",
          detail: "The worker failed while processing the webhook delivery request.",
        });
      }
      return;
    }

    if (request.method === "POST" && request.url === "/internal/control-jobs") {
      try {
        const payload = await readJsonBody(request);

        if (!isControlJobDispatchRequest(payload)) {
          sendJson(response, 400, {
            code: "invalid_control_job_request",
            detail: "Expected a control job payload with a supported kind.",
          });
          return;
        }

        const result = await options.processControlJob(payload);
        sendJson(response, 200, result);
      } catch (error) {
        if (isProblemDetails(error)) {
          sendJson(response, error.status, error);
          return;
        }

        sendJson(response, 500, {
          code: "worker_internal_error",
          detail: "The worker failed while processing the control job request.",
        });
      }
      return;
    }

    sendJson(response, 404, {
      code: "worker_route_not_found",
      detail: "The worker route does not exist.",
    });
  };

  const server = createServer((request, response) => {
    void handleRequest(request, response);
  });

  const actualPort = await listenServer(server, options.host, options.port);

  return {
    close: () => closeServer(server),
    host: options.host,
    port: actualPort,
    transport: "http",
  };
};
