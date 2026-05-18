import { createHash } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";

import type { ApiEnv, WorkerEnv } from "@mailmon/config";
import type { ConnectSessionResource, CreatedWebhookEndpointResource } from "@mailmon/core";
import { createDb, schema } from "@mailmon/db";
import { describe, expect, it } from "vitest";

import { withIsolatedDatabasePromise } from "../../../packages/db/src/test-setup.js";
import { startWorkerRuntime, type WorkerRuntimeHandle } from "../../worker/src/index.js";
import { createApiRuntime } from "./runtime.js";
import { createApp } from "./server.js";

const testRefreshTokenEncryptionKey = "BwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwc=";
const primaryWorkspaceId = "ws_sandbox_e2e";
const primaryApiKey = "mailmon_test_api_key";

const isReadonlyRecord = (value: unknown): value is Readonly<Record<string, unknown>> => {
  return typeof value === "object" && value !== null;
};

const getRequiredStringProperty = (
  value: Readonly<Record<string, unknown>>,
  key: string,
  context: string,
) => {
  const property = value[key];

  if (typeof property !== "string" || property.length === 0) {
    throw new Error(`Expected ${context}.${key} to be a non-empty string.`);
  }

  return property;
};

const parseJsonText = (value: string): unknown => {
  return JSON.parse(value) as unknown;
};

const readJsonResponse = async (response: Response) => {
  return parseJsonText(await response.text());
};

const closeServer = (server: Server) => {
  return new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
};

const listenServer = (server: Server) => {
  return new Promise<number>((resolve, reject) => {
    server.listen(0, "127.0.0.1", (error?: Error) => {
      if (error) {
        reject(error);
        return;
      }

      const address = server.address();

      if (address === null || typeof address === "string") {
        reject(new Error("Expected the test server to bind to an ephemeral port."));
        return;
      }

      resolve(address.port);
    });
  });
};

const reservePort = async () => {
  const server = createServer();

  try {
    const port = await listenServer(server);

    return port;
  } finally {
    await closeServer(server);
  }
};

const readRequestBody = async (request: IncomingMessage) => {
  const chunks: Buffer[] = [];

  for await (const chunk of request) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }

  return Buffer.concat(chunks).toString("utf8");
};

const sendJson = (response: ServerResponse, statusCode: number, body: unknown) => {
  response.writeHead(statusCode, {
    "content-type": "application/json",
  });
  response.end(JSON.stringify(body));
};

const startHttpServer = async (
  handler: (request: IncomingMessage, response: ServerResponse) => Promise<void>,
) => {
  const server = createServer((request, response) => {
    void handler(request, response).catch((error: unknown) => {
      if (!response.headersSent) {
        sendJson(response, 500, {
          error: error instanceof Error ? error.message : "Unexpected test server error",
        });
        return;
      }

      response.end();
    });
  });
  const port = await listenServer(server);

  return {
    baseUrl: `http://127.0.0.1:${port}`,
    close: () => closeServer(server),
  };
};

const waitFor = async <T>(
  read: () => Promise<T>,
  predicate: (value: T) => boolean,
  options: Readonly<{
    intervalMs?: number;
    timeoutMs?: number;
  }> = {},
) => {
  const startedAt = Date.now();
  const intervalMs = options.intervalMs ?? 50;
  const timeoutMs = options.timeoutMs ?? 10_000;

  while (true) {
    const value = await read();

    if (predicate(value)) {
      return value;
    }

    if (Date.now() - startedAt >= timeoutMs) {
      throw new Error(`Timed out after ${timeoutMs}ms waiting for the sandbox condition.`);
    }

    await new Promise((resolve) => {
      globalThis.setTimeout(resolve, intervalMs);
    });
  }
};

interface SandboxMessageRecord {
  readonly fromEmail: string;
  readonly fromName: string;
  readonly id: string;
  readonly internalDate: string;
  readonly labelIds: ReadonlyArray<string>;
  readonly snippet: string;
  readonly subject: string;
  readonly threadId: string;
}

interface SandboxSentMessage {
  readonly historyId: string;
  readonly messageId: string;
  readonly threadId: string;
}

interface SandboxMessageRequest {
  readonly fromEmail: string;
  readonly fromName: string;
  readonly snippet: string;
  readonly subject: string;
  readonly to: string;
}

type GmailSandboxFaultTarget = "history" | "message" | "message-list" | "profile";

type GmailSandboxFault =
  | {
      readonly kind: "expired-history-cursor";
    }
  | {
      readonly kind: "quota-403" | "rate-limit-429" | "transient-503";
      readonly targets: ReadonlyArray<GmailSandboxFaultTarget>;
    };

const parseSandboxMessageRequest = (value: unknown): SandboxMessageRequest => {
  if (!isReadonlyRecord(value)) {
    throw new Error("Expected sandbox message payload to be an object.");
  }

  return {
    fromEmail: getRequiredStringProperty(value, "fromEmail", "sandbox message payload"),
    fromName: getRequiredStringProperty(value, "fromName", "sandbox message payload"),
    snippet: getRequiredStringProperty(value, "snippet", "sandbox message payload"),
    subject: getRequiredStringProperty(value, "subject", "sandbox message payload"),
    to: getRequiredStringProperty(value, "to", "sandbox message payload"),
  };
};

const parseSandboxSentMessage = (value: unknown): SandboxSentMessage => {
  if (!isReadonlyRecord(value)) {
    throw new Error("Expected sandbox send response to be an object.");
  }

  return {
    historyId: getRequiredStringProperty(value, "historyId", "sandbox send response"),
    messageId: getRequiredStringProperty(value, "messageId", "sandbox send response"),
    threadId: getRequiredStringProperty(value, "threadId", "sandbox send response"),
  };
};

const parseConnectSessionResponse = (
  value: unknown,
): Pick<ConnectSessionResource, "connectUrl" | "id"> => {
  if (!isReadonlyRecord(value)) {
    throw new Error("Expected connect session response to be an object.");
  }

  return {
    connectUrl: getRequiredStringProperty(value, "connectUrl", "connect session response"),
    id: getRequiredStringProperty(value, "id", "connect session response"),
  };
};

const parseCreatedWebhookEndpointResponse = (
  value: unknown,
): Pick<CreatedWebhookEndpointResource, "id"> => {
  if (!isReadonlyRecord(value)) {
    throw new Error("Expected webhook endpoint response to be an object.");
  }

  return {
    id: getRequiredStringProperty(value, "id", "webhook endpoint response"),
  };
};

const startGmailSandbox = async (emailAddress: string) => {
  const authorizationRequests: URL[] = [];
  const issuedAuthorizationCodes = new Set<string>();
  const refreshToken = "sandbox_refresh_token";
  const accessToken = "sandbox_access_token";
  let refreshTokenRevoked = false;
  let activeFault: GmailSandboxFault | null = null;
  let currentHistoryId = 1;
  const knownHistoryIds = new Set<string>([String(currentHistoryId)]);
  const messages: SandboxMessageRecord[] = [];
  const historyEntries: Array<{
    readonly historyId: number;
    readonly record: {
      readonly messagesAdded: ReadonlyArray<{
        readonly message: {
          readonly id: string;
        };
      }>;
    };
  }> = [];
  const baseTimestampMs = Date.parse("2026-04-24T12:00:00.000Z");

  const sendGmailApiError = (
    response: ServerResponse,
    statusCode: number,
    params: Readonly<{
      message: string;
      reason?: string;
    }>,
  ) => {
    sendJson(response, statusCode, {
      error: {
        code: statusCode,
        message: params.message,
        errors:
          params.reason === undefined
            ? undefined
            : [
                {
                  domain: "usageLimits",
                  message: params.message,
                  reason: params.reason,
                },
              ],
      },
    });
  };

  const maybeSendFault = (target: GmailSandboxFaultTarget, response: ServerResponse) => {
    if (activeFault === null) {
      return false;
    }

    if (activeFault.kind === "expired-history-cursor") {
      if (target !== "history") {
        return false;
      }

      sendGmailApiError(response, 404, {
        message: "History cursor not found",
      });
      return true;
    }

    if (!activeFault.targets.includes(target)) {
      return false;
    }

    if (activeFault.kind === "quota-403") {
      sendGmailApiError(response, 403, {
        message: "Quota exceeded for this mailbox.",
        reason: "rateLimitExceeded",
      });
      return true;
    }

    if (activeFault.kind === "rate-limit-429") {
      sendGmailApiError(response, 429, {
        message: "Too many Gmail requests.",
      });
      return true;
    }

    sendGmailApiError(response, 503, {
      message: "Gmail is temporarily unavailable.",
    });
    return true;
  };

  const server = await startHttpServer(async (request, response) => {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");

    if (request.method === "GET" && url.pathname === "/oauth/authorize") {
      authorizationRequests.push(new URL(`http://sandbox.test${url.pathname}${url.search}`));

      const redirectUri = url.searchParams.get("redirect_uri");
      const state = url.searchParams.get("state");

      if (redirectUri === null || state === null) {
        sendJson(response, 400, {
          error: "invalid_request",
        });
        return;
      }

      const code = `sandbox_code_${authorizationRequests.length}`;
      issuedAuthorizationCodes.add(code);
      response.writeHead(302, {
        location: `${redirectUri}?state=${encodeURIComponent(state)}&code=${encodeURIComponent(code)}`,
      });
      response.end();
      return;
    }

    if (request.method === "POST" && url.pathname === "/oauth/token") {
      const body = new URLSearchParams(await readRequestBody(request));
      const grantType = body.get("grant_type");

      if (grantType === "authorization_code") {
        const code = body.get("code");

        if (code === null || !issuedAuthorizationCodes.has(code)) {
          sendJson(response, 400, {
            error: "invalid_grant",
          });
          return;
        }

        sendJson(response, 200, {
          access_token: accessToken,
          refresh_token: refreshToken,
        });
        return;
      }

      if (grantType === "refresh_token") {
        if (refreshTokenRevoked || body.get("refresh_token") !== refreshToken) {
          sendJson(response, 400, {
            error: "invalid_grant",
          });
          return;
        }

        sendJson(response, 200, {
          access_token: accessToken,
        });
        return;
      }

      sendJson(response, 400, {
        error: "unsupported_grant_type",
      });
      return;
    }

    if (request.method === "POST" && url.pathname === "/__sandbox/messages") {
      const payload = parseSandboxMessageRequest(parseJsonText(await readRequestBody(request)));

      if (payload.to !== emailAddress) {
        sendJson(response, 404, {
          error: "mailbox_not_found",
        });
        return;
      }

      const index = messages.length + 1;
      currentHistoryId += 1;
      knownHistoryIds.add(String(currentHistoryId));

      const message: SandboxMessageRecord = {
        fromEmail: payload.fromEmail,
        fromName: payload.fromName,
        id: `gmail_msg_${index}`,
        internalDate: String(baseTimestampMs + index * 60_000),
        labelIds: ["INBOX", "UNREAD"],
        snippet: payload.snippet,
        subject: payload.subject,
        threadId: `gmail_thr_${index}`,
      };

      messages.push(message);
      historyEntries.push({
        historyId: currentHistoryId,
        record: {
          messagesAdded: [
            {
              message: {
                id: message.id,
              },
            },
          ],
        },
      });

      sendJson(response, 201, {
        historyId: String(currentHistoryId),
        messageId: message.id,
        threadId: message.threadId,
      } satisfies SandboxSentMessage);
      return;
    }

    if (request.headers.authorization !== `Bearer ${accessToken}`) {
      sendJson(response, 401, {
        error: {
          code: 401,
          message: "Unauthorized",
        },
      });
      return;
    }

    if (request.method === "GET" && url.pathname === "/gmail/v1/users/me/profile") {
      if (maybeSendFault("profile", response)) {
        return;
      }

      sendJson(response, 200, {
        emailAddress,
        historyId: String(currentHistoryId),
      });
      return;
    }

    if (request.method === "GET" && url.pathname === "/gmail/v1/users/me/messages") {
      if (maybeSendFault("message-list", response)) {
        return;
      }

      sendJson(response, 200, {
        messages: messages.map((message) => ({
          id: message.id,
        })),
      });
      return;
    }

    if (request.method === "GET" && url.pathname.startsWith("/gmail/v1/users/me/messages/")) {
      if (maybeSendFault("message", response)) {
        return;
      }

      const messageId = decodeURIComponent(url.pathname.split("/").at(-1) ?? "");
      const message = messages.find((candidate) => candidate.id === messageId);

      if (message === undefined) {
        sendJson(response, 404, {
          error: {
            code: 404,
            message: "Not Found",
          },
        });
        return;
      }

      sendJson(response, 200, {
        id: message.id,
        internalDate: message.internalDate,
        labelIds: message.labelIds,
        payload: {
          headers: [
            {
              name: "From",
              value: `${message.fromName} <${message.fromEmail}>`,
            },
            {
              name: "Subject",
              value: message.subject,
            },
          ],
        },
        snippet: message.snippet,
        threadId: message.threadId,
      });
      return;
    }

    if (request.method === "GET" && url.pathname === "/gmail/v1/users/me/history") {
      if (maybeSendFault("history", response)) {
        return;
      }

      const startHistoryId = url.searchParams.get("startHistoryId");

      if (startHistoryId === null || !knownHistoryIds.has(startHistoryId)) {
        sendJson(response, 404, {
          error: {
            code: 404,
            message: "History cursor not found",
          },
        });
        return;
      }

      const startHistoryIdNumber = Number.parseInt(startHistoryId, 10);
      const history = historyEntries
        .filter((entry) => entry.historyId > startHistoryIdNumber)
        .map((entry) => entry.record);

      sendJson(response, 200, {
        history,
        historyId: String(currentHistoryId),
      });
      return;
    }

    sendJson(response, 404, {
      error: {
        code: 404,
        message: "Not Found",
      },
    });
  });

  return {
    authorizationRequests,
    baseUrl: server.baseUrl,
    close: server.close,
    emailAddress,
    clearFault: () => {
      activeFault = null;
    },
    revokeRefreshToken: () => {
      refreshTokenRevoked = true;
    },
    setFault: (fault: GmailSandboxFault) => {
      activeFault = fault;
    },
    sendEmail: async (params: {
      readonly fromEmail: string;
      readonly fromName: string;
      readonly snippet: string;
      readonly subject: string;
      readonly to: string;
    }) => {
      const response = await fetch(`${server.baseUrl}/__sandbox/messages`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify(params),
      });

      if (!response.ok) {
        throw new Error(`Sandbox message send failed with HTTP ${response.status}.`);
      }

      return parseSandboxSentMessage(await readJsonResponse(response));
    },
  };
};

const startWebhookReceiver = async (
  options: Readonly<{
    responseStatuses?: ReadonlyArray<number>;
  }> = {},
) => {
  const deliveries: Array<{
    readonly body: unknown;
    readonly headers: IncomingMessage["headers"];
    readonly responseStatusCode: number;
  }> = [];
  const server = await startHttpServer(async (request, response) => {
    const responseStatusCode = options.responseStatuses?.[deliveries.length] ?? 202;

    deliveries.push({
      body: JSON.parse(await readRequestBody(request)) as unknown,
      headers: request.headers,
      responseStatusCode,
    });

    sendJson(response, responseStatusCode, {
      accepted: responseStatusCode >= 200 && responseStatusCode < 300,
    });
  });

  return {
    close: server.close,
    deliveries,
    url: `${server.baseUrl}/webhooks/mailmon`,
  };
};

const seedWorkspaceApiKey = async (connectionString: string) => {
  const database = createDb(connectionString);

  try {
    await database.db.insert(schema.workspaces).values({
      id: primaryWorkspaceId,
    });
    await database.db.insert(schema.workspaceApiKeys).values({
      id: "wak_sandbox_e2e",
      workspaceId: primaryWorkspaceId,
      apiKeyHash: createHash("sha256").update(primaryApiKey).digest("hex"),
    });
  } finally {
    await database.client.end();
  }
};

const readMailboxPersistence = async (connectionString: string, mailboxId: string) => {
  const database = createDb(connectionString);

  try {
    const [mailbox, messages, syncRuns, threads, mailboxEvents, webhookDeliveries] =
      await Promise.all([
        database.db
          .select()
          .from(schema.mailboxes)
          .then((rows) => rows.find((row) => row.id === mailboxId) ?? null),
        database.db
          .select()
          .from(schema.messages)
          .then((rows) => rows.filter((row) => row.mailboxId === mailboxId)),
        database.db
          .select()
          .from(schema.syncRuns)
          .then((rows) => rows.filter((row) => row.mailboxId === mailboxId)),
        database.db
          .select()
          .from(schema.threads)
          .then((rows) => rows.filter((row) => row.mailboxId === mailboxId)),
        database.db
          .select()
          .from(schema.mailboxEvents)
          .then((rows) => rows.filter((row) => row.mailboxId === mailboxId)),
        database.db.select().from(schema.webhookDeliveries),
      ]);
    const mailboxEventIds = new Set(mailboxEvents.map((event) => event.id));

    return {
      mailbox,
      mailboxEvents,
      messages,
      syncRuns,
      threads,
      webhookDeliveries: webhookDeliveries.filter((delivery) =>
        mailboxEventIds.has(delivery.mailboxEventId),
      ),
    };
  } finally {
    await database.client.end();
  }
};

type MailboxPersistenceSnapshot = Awaited<ReturnType<typeof readMailboxPersistence>>;

const readSortedRowIds = (rows: ReadonlyArray<{ readonly id: string }>) =>
  rows.reduce<ReadonlyArray<string>>((ids, row) => {
    const insertionIndex = ids.findIndex((id) => row.id.localeCompare(id) < 0);

    if (insertionIndex === -1) {
      return [...ids, row.id];
    }

    return [...ids.slice(0, insertionIndex), row.id, ...ids.slice(insertionIndex)];
  }, []);

const readCanonicalFingerprint = (state: MailboxPersistenceSnapshot) => {
  return {
    cursor: state.mailbox?.cursor ?? null,
    mailboxEventIds: readSortedRowIds(state.mailboxEvents),
    messageIds: readSortedRowIds(state.messages),
    threadIds: readSortedRowIds(state.threads),
    webhookDeliveryIds: readSortedRowIds(state.webhookDeliveries),
  };
};

interface SandboxE2eHarness {
  readonly apiHeaders: Readonly<Record<string, string>>;
  readonly apiOrigin: string;
  readonly app: ReturnType<typeof createApp>;
  readonly close: () => Promise<void>;
  readonly sandbox: Awaited<ReturnType<typeof startGmailSandbox>>;
  readonly webhookReceiver: Awaited<ReturnType<typeof startWebhookReceiver>>;
  readonly workerBaseUrl: string;
}

const startSandboxE2eHarness = async (
  connectionString: string,
  options: Readonly<{
    emailAddress: string;
    webhookResponseStatuses?: ReadonlyArray<number>;
  }>,
): Promise<SandboxE2eHarness> => {
  const workerPort = await reservePort();
  const workerBaseUrl = `http://127.0.0.1:${workerPort}`;
  const sandbox = await startGmailSandbox(options.emailAddress);
  const webhookReceiver = await startWebhookReceiver({
    responseStatuses: options.webhookResponseStatuses,
  });
  let workerRuntime: WorkerRuntimeHandle | null = null;
  let apiRuntime: ReturnType<typeof createApiRuntime> | null = null;

  const close = async () => {
    await Promise.all([
      apiRuntime?.dispose(),
      workerRuntime?.close(),
      webhookReceiver.close(),
      sandbox.close(),
    ]);
  };

  try {
    await seedWorkspaceApiKey(connectionString);

    const workerEnv: WorkerEnv = {
      asyncTransportMode: "local",
      databaseUrl: connectionString,
      gmailApiBaseUrl: `${sandbox.baseUrl}/gmail/v1`,
      gmailOauthClientId: "sandbox-client-id",
      gmailOauthClientSecret: "sandbox-client-secret",
      gmailRefreshTokenEncryptionKey: testRefreshTokenEncryptionKey,
      gmailRefreshTokenEncryptionKeyId: "primary",
      gmailRefreshTokenPreviousEncryptionKeys: [],
      gmailOauthTokenUrl: `${sandbox.baseUrl}/oauth/token`,
      gmailPubSubTopicName: null,
      syncDispatchPubSubTopicName: null,
      gcpProjectId: null,
      gcpRegion: null,
      gcpSchedulerServiceAccountEmail: null,
      gcpTasksAudience: null,
      gcpTasksServiceAccountEmail: null,
      gcpWebhookDeliveryQueueId: "mailmon-webhook-deliveries",
      host: "127.0.0.1",
      nodeEnv: "test",
      port: workerPort,
      redisUrl: null,
      workerBaseUrl,
    };

    workerRuntime = await startWorkerRuntime(workerEnv);

    const apiEnv: Pick<
      ApiEnv,
      | "asyncTransportMode"
      | "databaseUrl"
      | "gmailApiBaseUrl"
      | "gmailOauthAuthorizeUrl"
      | "gmailOauthClientId"
      | "gmailOauthClientSecret"
      | "gmailRefreshTokenEncryptionKey"
      | "gmailRefreshTokenEncryptionKeyId"
      | "gmailRefreshTokenPreviousEncryptionKeys"
      | "gmailOauthTokenUrl"
      | "nodeEnv"
      | "syncDispatchPubSubTopicName"
      | "workerBaseUrl"
    > = {
      asyncTransportMode: "local",
      databaseUrl: connectionString,
      gmailApiBaseUrl: `${sandbox.baseUrl}/gmail/v1`,
      gmailOauthAuthorizeUrl: `${sandbox.baseUrl}/oauth/authorize`,
      gmailOauthClientId: "sandbox-client-id",
      gmailOauthClientSecret: "sandbox-client-secret",
      gmailRefreshTokenEncryptionKey: testRefreshTokenEncryptionKey,
      gmailRefreshTokenEncryptionKeyId: "primary",
      gmailRefreshTokenPreviousEncryptionKeys: [],
      gmailOauthTokenUrl: `${sandbox.baseUrl}/oauth/token`,
      nodeEnv: "test",
      syncDispatchPubSubTopicName: null,
      workerBaseUrl,
    };

    apiRuntime = createApiRuntime(apiEnv);

    return {
      apiHeaders: {
        authorization: `Bearer ${primaryApiKey}`,
        "content-type": "application/json",
      },
      apiOrigin: "http://api.mailmon.test",
      app: createApp(apiRuntime),
      close,
      sandbox,
      webhookReceiver,
      workerBaseUrl,
    };
  } catch (error) {
    await close();
    throw error;
  }
};

const connectSandboxMailbox = async (
  harness: SandboxE2eHarness,
  params: Readonly<{
    mailboxExternalId: string;
    tenantExternalId: string;
  }>,
) => {
  const connectSessionResponse = await harness.app.request(
    `${harness.apiOrigin}/v1/mailboxes/connect-sessions`,
    {
      method: "POST",
      headers: harness.apiHeaders,
      body: JSON.stringify({
        provider: "gmail",
        tenantExternalId: params.tenantExternalId,
        mailboxExternalId: params.mailboxExternalId,
        redirectUrl: "https://app.example.com/settings/gmail/callback",
      }),
    },
  );

  expect(connectSessionResponse.status).toBe(201);

  const connectSession = parseConnectSessionResponse(
    await readJsonResponse(connectSessionResponse),
  );
  const hostedConnectResponse = await harness.app.request(connectSession.connectUrl);

  expect(hostedConnectResponse.status).toBe(302);

  const authorizationUrl = hostedConnectResponse.headers.get("location");

  expect(authorizationUrl).not.toBeNull();

  const sandboxAuthorizationResponse = await fetch(authorizationUrl!, {
    redirect: "manual",
  });

  expect(sandboxAuthorizationResponse.status).toBe(302);

  const callbackUrl = sandboxAuthorizationResponse.headers.get("location");

  if (callbackUrl === null) {
    throw new Error("Expected the sandbox authorization step to redirect to the callback.");
  }

  const callbackResponse = await harness.app.request(callbackUrl);

  expect(callbackResponse.status).toBe(302);

  const frontendRedirectLocation = callbackResponse.headers.get("location");

  if (frontendRedirectLocation === null) {
    throw new Error("Expected the callback to redirect back to the client redirect URL.");
  }

  const frontendRedirectUrl = new URL(frontendRedirectLocation);
  const mailboxId = frontendRedirectUrl.searchParams.get("mailbox_id");

  expect(frontendRedirectUrl.searchParams.get("status")).toBe("success");
  expect(frontendRedirectUrl.searchParams.get("created")).toBe("true");

  if (mailboxId === null) {
    throw new Error("Expected the hosted connect callback to return a mailbox_id.");
  }

  return mailboxId;
};

const createMessageCreatedSubscription = async (harness: SandboxE2eHarness, mailboxId: string) => {
  const webhookEndpointResponse = await harness.app.request(
    `${harness.apiOrigin}/v1/webhook-endpoints`,
    {
      method: "POST",
      headers: harness.apiHeaders,
      body: JSON.stringify({
        url: harness.webhookReceiver.url,
        description: "sandbox e2e",
      }),
    },
  );

  expect(webhookEndpointResponse.status).toBe(201);

  const webhookEndpoint = parseCreatedWebhookEndpointResponse(
    await readJsonResponse(webhookEndpointResponse),
  );
  const subscriptionResponse = await harness.app.request(
    `${harness.apiOrigin}/v1/webhook-endpoints/${webhookEndpoint.id}/subscriptions`,
    {
      method: "POST",
      headers: harness.apiHeaders,
      body: JSON.stringify({
        mailbox_ids: [mailboxId],
        event_types: ["message.created"],
      }),
    },
  );

  expect(subscriptionResponse.status).toBe(201);
};

const runWorkerSync = async (workerBaseUrl: string, mailboxId: string) => {
  const response = await fetch(`${workerBaseUrl}/internal/sync`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      mailboxId,
    }),
  });

  return {
    body: await readJsonResponse(response),
    status: response.status,
  };
};

interface ProviderFailureScenario {
  readonly emailAddress: string;
  readonly expectedMailboxLastErrorRetryable: boolean;
  readonly expectedProblemCode: string;
  readonly expectedProblemRetryable: boolean;
  readonly expectedSyncState: string;
  readonly fault: GmailSandboxFault;
  readonly prepare?: (
    harness: SandboxE2eHarness,
    connectionString: string,
    mailboxId: string,
  ) => Promise<void>;
  readonly slug: string;
  readonly status: number;
}

const seedPendingSandboxMessage = async (harness: SandboxE2eHarness) => {
  await harness.sandbox.sendEmail({
    to: harness.sandbox.emailAddress,
    fromEmail: "faults@sandbox.mailmon.dev",
    fromName: "Sandbox Faults",
    subject: "Provider failure fixture",
    snippet: "This message should not be committed while the provider is failing.",
  });
};

const providerFailureScenarios: ReadonlyArray<ProviderFailureScenario> = [
  {
    emailAddress: "quota-403@mailmon.dev",
    expectedMailboxLastErrorRetryable: true,
    expectedProblemCode: "gmail_rate_limited",
    expectedProblemRetryable: true,
    expectedSyncState: "lagging",
    fault: {
      kind: "quota-403",
      targets: ["history"],
    },
    prepare: seedPendingSandboxMessage,
    slug: "quota-style-403-rate-limit",
    status: 403,
  },
  {
    emailAddress: "rate-limit-429@mailmon.dev",
    expectedMailboxLastErrorRetryable: true,
    expectedProblemCode: "gmail_rate_limited",
    expectedProblemRetryable: true,
    expectedSyncState: "lagging",
    fault: {
      kind: "rate-limit-429",
      targets: ["message"],
    },
    prepare: seedPendingSandboxMessage,
    slug: "message-429-rate-limit",
    status: 429,
  },
  {
    emailAddress: "history-503@mailmon.dev",
    expectedMailboxLastErrorRetryable: true,
    expectedProblemCode: "gmail_history_fetch_failed",
    expectedProblemRetryable: true,
    expectedSyncState: "failed",
    fault: {
      kind: "transient-503",
      targets: ["history"],
    },
    prepare: seedPendingSandboxMessage,
    slug: "history-503-transient",
    status: 503,
  },
  {
    emailAddress: "expired-history@mailmon.dev",
    expectedMailboxLastErrorRetryable: true,
    expectedProblemCode: "gmail_history_cursor_invalid",
    expectedProblemRetryable: false,
    expectedSyncState: "lagging",
    fault: {
      kind: "expired-history-cursor",
    },
    prepare: seedPendingSandboxMessage,
    slug: "expired-history-cursor",
    status: 409,
  },
];

describe("sandbox end-to-end happy path", () => {
  it("connects a sandbox mailbox, syncs a new message, and delivers a webhook through the real runtimes", async () => {
    await withIsolatedDatabasePromise(async ({ connectionString }) => {
      const harness = await startSandboxE2eHarness(connectionString, {
        emailAddress: "sandbox@mailmon.dev",
      });

      try {
        const mailboxId = await connectSandboxMailbox(harness, {
          tenantExternalId: "tenant_sandbox",
          mailboxExternalId: "mailbox_sandbox",
        });

        expect(harness.sandbox.authorizationRequests).toHaveLength(1);
        expect(harness.sandbox.authorizationRequests[0]?.searchParams.get("client_id")).toBe(
          "sandbox-client-id",
        );

        const initialMessagesResponse = await harness.app.request(
          `${harness.apiOrigin}/v1/messages?mailboxId=${mailboxId}`,
          {
            headers: {
              authorization: `Bearer ${primaryApiKey}`,
            },
          },
        );

        expect(initialMessagesResponse.status).toBe(200);
        await expect(initialMessagesResponse.json()).resolves.toEqual({
          object: "list",
          data: [],
          nextCursor: null,
        });

        await createMessageCreatedSubscription(harness, mailboxId);

        const sentMessage = await harness.sandbox.sendEmail({
          to: harness.sandbox.emailAddress,
          fromEmail: "alerts@sandbox.mailmon.dev",
          fromName: "Sandbox Alerts",
          subject: "Sandbox hello",
          snippet: "Hello from the sandbox mailbox.",
        });

        const syncResponse = await runWorkerSync(harness.workerBaseUrl, mailboxId);

        expect(syncResponse.status).toBe(200);
        expect(syncResponse.body).toMatchObject({
          mailboxId,
          status: "completed",
          eventsEmitted: 2,
          nextCursor: sentMessage.historyId,
        });

        const deliveredWebhook = await waitFor(
          async () => harness.webhookReceiver.deliveries[0] ?? null,
          (value) => value !== null,
        );

        expect(deliveredWebhook?.headers["x-mailmon-event-id"]).toEqual(expect.any(String));
        expect(deliveredWebhook?.headers["x-mailmon-signature"]).toEqual(expect.any(String));
        expect(deliveredWebhook?.body).toMatchObject({
          type: "message.created",
          workspaceId: primaryWorkspaceId,
          mailboxId,
          data: {
            messageId: `msg_${mailboxId}_${sentMessage.messageId}`,
            providerMessageId: sentMessage.messageId,
            providerThreadId: sentMessage.threadId,
            subject: "Sandbox hello",
            snippet: "Hello from the sandbox mailbox.",
            labelIds: ["INBOX", "UNREAD"],
          },
        });

        const persistedState = await waitFor(
          () => readMailboxPersistence(connectionString, mailboxId),
          (value) => value.webhookDeliveries.some((delivery) => delivery.state === "delivered"),
        );
        const mailboxEventTypes = persistedState.mailboxEvents.map((event) => event.eventType);

        mailboxEventTypes.sort((left, right) => left.localeCompare(right));

        expect(persistedState.mailbox).toMatchObject({
          id: mailboxId,
          status: "active",
          syncState: "healthy",
          cursor: sentMessage.historyId,
        });
        expect(persistedState.messages).toHaveLength(1);
        expect(persistedState.threads).toHaveLength(1);
        expect(mailboxEventTypes).toEqual(["message.created", "thread.updated"]);
        expect(persistedState.webhookDeliveries).toEqual([
          expect.objectContaining({
            state: "delivered",
            lastResponseStatus: 202,
          }),
        ]);

        const messagesResponse = await harness.app.request(
          `${harness.apiOrigin}/v1/messages?mailboxId=${mailboxId}`,
          {
            headers: {
              authorization: `Bearer ${primaryApiKey}`,
            },
          },
        );

        expect(messagesResponse.status).toBe(200);
        await expect(messagesResponse.json()).resolves.toEqual({
          object: "list",
          data: [
            {
              id: `msg_${mailboxId}_${sentMessage.messageId}`,
              mailboxId,
              threadId: `thr_${mailboxId}_${sentMessage.threadId}`,
              providerMessageId: sentMessage.messageId,
              subject: "Sandbox hello",
              from: {
                name: "Sandbox Alerts",
                email: "alerts@sandbox.mailmon.dev",
              },
              snippet: "Hello from the sandbox mailbox.",
              receivedAt: expect.any(String),
              labelIds: ["INBOX", "UNREAD"],
            },
          ],
          nextCursor: null,
        });
      } finally {
        await harness.close();
      }
    });
  }, 30_000);
});

describe("sandbox end-to-end resilience matrix", () => {
  for (const scenario of providerFailureScenarios) {
    it(`provider-failure-e2e-preserves-operational-state: ${scenario.slug}`, async () => {
      await withIsolatedDatabasePromise(async ({ connectionString }) => {
        const harness = await startSandboxE2eHarness(connectionString, {
          emailAddress: scenario.emailAddress,
        });

        try {
          const mailboxId = await connectSandboxMailbox(harness, {
            tenantExternalId: `tenant_${scenario.slug}`,
            mailboxExternalId: `mailbox_${scenario.slug}`,
          });

          await waitFor(
            () => readMailboxPersistence(connectionString, mailboxId),
            (value) => value.mailbox?.cursor === "1",
          );

          await scenario.prepare?.(harness, connectionString, mailboxId);

          const stateBeforeFailure = await readMailboxPersistence(connectionString, mailboxId);
          const canonicalStateBeforeFailure = readCanonicalFingerprint(stateBeforeFailure);

          harness.sandbox.setFault(scenario.fault);

          const failureSync = await runWorkerSync(harness.workerBaseUrl, mailboxId);

          expect(failureSync.status).toBe(scenario.status);
          expect(failureSync.body).toMatchObject({
            code: scenario.expectedProblemCode,
            retryable: scenario.expectedProblemRetryable,
            status: scenario.status,
          });

          const stateAfterFailure = await readMailboxPersistence(connectionString, mailboxId);
          const providerFailureSyncRun = stateAfterFailure.syncRuns.find(
            (syncRun) => syncRun.detail === scenario.expectedProblemCode,
          );

          expect(readCanonicalFingerprint(stateAfterFailure)).toEqual(canonicalStateBeforeFailure);
          expect(stateAfterFailure.mailbox).toMatchObject({
            id: mailboxId,
            status: "active",
            syncState: scenario.expectedSyncState,
            cursor: canonicalStateBeforeFailure.cursor,
            lastErrorCode: scenario.expectedProblemCode,
            lastErrorRetryable: scenario.expectedMailboxLastErrorRetryable,
          });
          expect(providerFailureSyncRun).toMatchObject({
            mailboxId,
            status: "failed_after_lease_acquired",
            detail: scenario.expectedProblemCode,
            eventsEmitted: "0",
            previousCursor: canonicalStateBeforeFailure.cursor,
            nextCursor: null,
          });
        } finally {
          harness.sandbox.clearFault();
          await harness.close();
        }
      });
    }, 30_000);
  }

  it("moves a mailbox to reconnect_required when the sandbox refresh token is revoked", async () => {
    await withIsolatedDatabasePromise(async ({ connectionString }) => {
      const harness = await startSandboxE2eHarness(connectionString, {
        emailAddress: "reconnect@mailmon.dev",
      });

      try {
        const mailboxId = await connectSandboxMailbox(harness, {
          tenantExternalId: "tenant_reconnect",
          mailboxExternalId: "mailbox_reconnect",
        });

        await waitFor(
          () => readMailboxPersistence(connectionString, mailboxId),
          (value) => value.mailbox?.cursor === "1",
        );

        harness.sandbox.revokeRefreshToken();

        const reconnectSync = await runWorkerSync(harness.workerBaseUrl, mailboxId);

        expect(reconnectSync.status).toBe(200);
        expect(reconnectSync.body).toMatchObject({
          mailboxId,
          status: "reconnect_required",
          eventsEmitted: 0,
          nextCursor: null,
        });

        const persistedState = await waitFor(
          () => readMailboxPersistence(connectionString, mailboxId),
          (value) => value.mailbox?.status === "reconnect_required",
        );

        expect(persistedState.mailbox).toMatchObject({
          id: mailboxId,
          status: "reconnect_required",
          syncState: "failed",
          cursor: "1",
          lastErrorCode: "gmail_token_refresh_reconnect_required",
          lastErrorRetryable: false,
        });

        const alreadyReconnectRequiredSync = await runWorkerSync(harness.workerBaseUrl, mailboxId);

        expect(alreadyReconnectRequiredSync.status).toBe(200);
        expect(alreadyReconnectRequiredSync.body).toMatchObject({
          mailboxId,
          status: "reconnect_required",
          eventsEmitted: 0,
          nextCursor: null,
        });
      } finally {
        await harness.close();
      }
    });
  }, 30_000);

  it("retries webhook delivery, avoids duplicate incremental work, and preserves newest-first reads", async () => {
    await withIsolatedDatabasePromise(async ({ connectionString }) => {
      const harness = await startSandboxE2eHarness(connectionString, {
        emailAddress: "incremental@mailmon.dev",
        webhookResponseStatuses: [500, 202, 202],
      });

      try {
        const mailboxId = await connectSandboxMailbox(harness, {
          tenantExternalId: "tenant_incremental",
          mailboxExternalId: "mailbox_incremental",
        });

        await waitFor(
          () => readMailboxPersistence(connectionString, mailboxId),
          (value) => value.mailbox?.cursor === "1",
        );

        await createMessageCreatedSubscription(harness, mailboxId);

        const firstMessage = await harness.sandbox.sendEmail({
          to: harness.sandbox.emailAddress,
          fromEmail: "alerts@sandbox.mailmon.dev",
          fromName: "Sandbox Alerts",
          subject: "First incremental message",
          snippet: "The first incremental message.",
        });
        const firstSync = await runWorkerSync(harness.workerBaseUrl, mailboxId);

        expect(firstSync.status).toBe(200);
        expect(firstSync.body).toMatchObject({
          mailboxId,
          status: "completed",
          eventsEmitted: 2,
          nextCursor: firstMessage.historyId,
        });

        const retriedDeliveryState = await waitFor(
          () => readMailboxPersistence(connectionString, mailboxId),
          (value) =>
            value.webhookDeliveries.some(
              (delivery) => delivery.state === "delivered" && delivery.attemptCount === 2,
            ),
          {
            timeoutMs: 15_000,
          },
        );

        expect(
          harness.webhookReceiver.deliveries.map((delivery) => delivery.responseStatusCode),
        ).toEqual([500, 202]);
        expect(retriedDeliveryState.webhookDeliveries).toEqual([
          expect.objectContaining({
            attemptCount: 2,
            lastResponseStatus: 202,
            state: "delivered",
          }),
        ]);

        const duplicateSync = await runWorkerSync(harness.workerBaseUrl, mailboxId);

        expect(duplicateSync.status).toBe(200);
        expect(duplicateSync.body).toMatchObject({
          mailboxId,
          status: "completed",
          eventsEmitted: 0,
          nextCursor: firstMessage.historyId,
        });

        const stateAfterDuplicateSync = await readMailboxPersistence(connectionString, mailboxId);

        expect(stateAfterDuplicateSync.mailboxEvents).toHaveLength(2);
        expect(stateAfterDuplicateSync.webhookDeliveries).toHaveLength(1);

        const secondMessage = await harness.sandbox.sendEmail({
          to: harness.sandbox.emailAddress,
          fromEmail: "reports@sandbox.mailmon.dev",
          fromName: "Sandbox Reports",
          subject: "Second incremental message",
          snippet: "The second incremental message.",
        });
        const secondSync = await runWorkerSync(harness.workerBaseUrl, mailboxId);

        expect(secondSync.status).toBe(200);
        expect(secondSync.body).toMatchObject({
          mailboxId,
          status: "completed",
          eventsEmitted: 2,
          nextCursor: secondMessage.historyId,
        });

        const finalPersistedState = await waitFor(
          () => readMailboxPersistence(connectionString, mailboxId),
          (value) =>
            value.webhookDeliveries.filter((delivery) => delivery.state === "delivered").length ===
            2,
        );

        expect(finalPersistedState.mailbox).toMatchObject({
          id: mailboxId,
          status: "active",
          syncState: "healthy",
          cursor: secondMessage.historyId,
        });
        expect(finalPersistedState.mailboxEvents).toHaveLength(4);
        expect(finalPersistedState.messages).toHaveLength(2);
        expect(finalPersistedState.threads).toHaveLength(2);
        expect(
          harness.webhookReceiver.deliveries.map((delivery) => delivery.responseStatusCode),
        ).toEqual([500, 202, 202]);

        const messagesResponse = await harness.app.request(
          `${harness.apiOrigin}/v1/messages?mailboxId=${mailboxId}`,
          {
            headers: {
              authorization: `Bearer ${primaryApiKey}`,
            },
          },
        );

        expect(messagesResponse.status).toBe(200);
        await expect(messagesResponse.json()).resolves.toMatchObject({
          object: "list",
          data: [
            {
              id: `msg_${mailboxId}_${secondMessage.messageId}`,
              providerMessageId: secondMessage.messageId,
              subject: "Second incremental message",
            },
            {
              id: `msg_${mailboxId}_${firstMessage.messageId}`,
              providerMessageId: firstMessage.messageId,
              subject: "First incremental message",
            },
          ],
          nextCursor: null,
        });
      } finally {
        await harness.close();
      }
    });
  }, 45_000);
});
