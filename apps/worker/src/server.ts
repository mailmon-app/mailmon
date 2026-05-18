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
import { Effect, Layer, ManagedRuntime, References } from "effect";
import { Hono } from "hono";

import { authorizeInternalRequest, type WorkerInternalAuthOptions } from "./internal-auth.js";
import {
  createJsonResponse,
  interpretInternalRoute,
  WorkerHttpProcessors,
  type InternalRouteSpec,
  type WorkerHttpServerRuntime,
} from "./internal-route-interpreter.js";

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

const logInvalidMailboxSyncDeadLetter = (detail: string) =>
  Effect.logInfo("mailbox_sync_dispatch_dead_letter_invalid").pipe(
    Effect.annotateLogs("detail", detail),
  );

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
    invalidRequest: (detail) =>
      logInvalidMailboxSyncDeadLetter(detail).pipe(
        Effect.map(() =>
          createJsonResponse(
            {
              status: "accepted",
              detail,
            },
            200,
          ),
        ),
      ),
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
    Layer.mergeAll(
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
      process.env.NODE_ENV === "test" ? Layer.succeed(References.MinimumLogLevel, "None") : Layer.empty,
    ),
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
