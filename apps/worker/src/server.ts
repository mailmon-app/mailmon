import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";

import type { AsyncTransportMode } from "@mailmon/config";
import type {
  ControlJobDispatchRequest,
  ControlJobRunResult,
  MailboxSyncJobData,
  ProblemDetails,
  ProcessWebhookDeliveryResult,
  SyncMailboxResult,
  WebhookDeliveryScheduleRequest,
} from "@mailmon/core";

interface WorkerHttpRuntimeOptions {
  readonly host: string;
  readonly port: number;
  readonly asyncTransportMode: AsyncTransportMode;
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

const sendJson = (response: ServerResponse, statusCode: number, body: unknown) => {
  response.writeHead(statusCode, {
    "content-type": "application/json",
  });
  response.end(JSON.stringify(body));
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
  const handleRequest = async (request: IncomingMessage, response: ServerResponse) => {
    if (request.method === "GET" && request.url === "/health") {
      sendJson(response, 200, {
        status: "ok",
        transportMode: options.asyncTransportMode,
      });
      return;
    }

    if (request.method === "POST" && request.url === "/internal/sync") {
      try {
        const payload = await readJsonBody(request);

        if (!isMailboxSyncJobData(payload)) {
          sendJson(response, 400, {
            code: "invalid_mailbox_sync_request",
            detail: "Expected a mailbox-scoped sync payload with a non-empty mailboxId.",
          });
          return;
        }

        const result = await options.processSyncJob(payload);
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

      sendJson(response, 501, {
        code: "gmail_push_not_implemented",
        detail: "GCP Gmail push handling is not implemented yet.",
      });
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
