import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createHash } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { fileURLToPath } from "node:url";

import type { ApiEnv, WorkerEnv } from "@mailmon/config";
import type { ConnectSessionResource } from "@mailmon/core";
import { createDb, schema } from "@mailmon/db";
import { describe, expect, it } from "vitest";

import { withIsolatedDatabasePromise } from "../../../packages/db/src/test-setup.js";
import { startWorkerRuntime, type WorkerRuntimeHandle } from "../../worker/src/index.js";
import { createApiRuntime } from "./runtime.js";
import { createApp } from "./server.js";

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));
const tsxBin = fileURLToPath(
  new URL(["..", "..", "..", "node_modules", ".bin", "tsx"].join("/"), import.meta.url),
);
const testRefreshTokenEncryptionKey = "BwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwc=";
const primaryWorkspaceId = "ws_worker_death_chaos";
const primaryApiKey = "mailmon_worker_death_api_key";
const chaosLeaseTtlMs = 800;
const chaosHeartbeatIntervalMs = 250;
const noop = () => {};

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
    return await listenServer(server);
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
      throw new Error(`Timed out after ${timeoutMs}ms waiting for the chaos condition.`);
    }

    await new Promise((resolve) => {
      globalThis.setTimeout(resolve, intervalMs);
    });
  }
};

const withTimeout = async <T>(promise: Promise<T>, timeoutMs: number, label: string) => {
  let timer: ReturnType<typeof globalThis.setTimeout>;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = globalThis.setTimeout(() => {
      reject(new Error(`Timed out after ${timeoutMs}ms waiting for ${label}.`));
    }, timeoutMs);
  });

  try {
    return await Promise.race([promise, timeout]);
  } finally {
    globalThis.clearTimeout(timer!);
  }
};

const createPauseGate = () => {
  let paused = false;
  let release: () => void = noop;
  let notifyPaused: () => void = noop;
  const pausedPromise = new Promise<void>((resolve) => {
    notifyPaused = resolve;
  });
  const releasePromise = new Promise<void>((resolve) => {
    release = resolve;
  });

  return {
    pause: async () => {
      paused = true;
      notifyPaused();
      await releasePromise;
    },
    release,
    waitUntilPaused: () => (paused ? Promise.resolve() : pausedPromise),
  };
};

interface SandboxSentMessage {
  readonly historyId: string;
  readonly messageId: string;
  readonly threadId: string;
}

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

const startGmailSandbox = async (emailAddress: string) => {
  const authorizationRequests: URL[] = [];
  const issuedAuthorizationCodes = new Set<string>();
  const refreshToken = "sandbox_refresh_token";
  const accessToken = "sandbox_access_token";
  let currentHistoryId = 1;
  let nextMessagePause: ReturnType<typeof createPauseGate> | null = null;
  const knownHistoryIds = new Set<string>([String(currentHistoryId)]);
  const messages: Array<{
    readonly fromEmail: string;
    readonly fromName: string;
    readonly id: string;
    readonly internalDate: string;
    readonly labelIds: ReadonlyArray<string>;
    readonly snippet: string;
    readonly subject: string;
    readonly threadId: string;
  }> = [];
  const historyEntries: Array<{
    readonly historyId: number;
    readonly messageId: string;
  }> = [];
  const baseTimestampMs = Date.parse("2026-04-24T12:00:00.000Z");

  const server = await startHttpServer(async (request, response) => {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");

    if (request.method === "GET" && url.pathname === "/oauth/authorize") {
      authorizationRequests.push(new URL(`http://sandbox.test${url.pathname}${url.search}`));

      const redirectUri = url.searchParams.get("redirect_uri");
      const state = url.searchParams.get("state");

      if (redirectUri === null || state === null) {
        sendJson(response, 400, { error: "invalid_request" });
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

      if (body.get("grant_type") === "authorization_code") {
        const code = body.get("code");

        if (code === null || !issuedAuthorizationCodes.has(code)) {
          sendJson(response, 400, { error: "invalid_grant" });
          return;
        }

        sendJson(response, 200, {
          access_token: accessToken,
          refresh_token: refreshToken,
        });
        return;
      }

      if (body.get("grant_type") === "refresh_token") {
        if (body.get("refresh_token") !== refreshToken) {
          sendJson(response, 400, { error: "invalid_grant" });
          return;
        }

        sendJson(response, 200, {
          access_token: accessToken,
        });
        return;
      }

      sendJson(response, 400, { error: "unsupported_grant_type" });
      return;
    }

    if (request.method === "POST" && url.pathname === "/__sandbox/messages") {
      const payload = parseJsonText(await readRequestBody(request));

      if (!isReadonlyRecord(payload)) {
        sendJson(response, 400, { error: "invalid_message" });
        return;
      }

      if (getRequiredStringProperty(payload, "to", "sandbox message payload") !== emailAddress) {
        sendJson(response, 404, { error: "mailbox_not_found" });
        return;
      }

      const index = messages.length + 1;
      currentHistoryId += 1;
      knownHistoryIds.add(String(currentHistoryId));

      const message = {
        fromEmail: getRequiredStringProperty(payload, "fromEmail", "sandbox message payload"),
        fromName: getRequiredStringProperty(payload, "fromName", "sandbox message payload"),
        id: `gmail_msg_${index}`,
        internalDate: String(baseTimestampMs + index * 60_000),
        labelIds: ["INBOX", "UNREAD"],
        snippet: getRequiredStringProperty(payload, "snippet", "sandbox message payload"),
        subject: getRequiredStringProperty(payload, "subject", "sandbox message payload"),
        threadId: `gmail_thr_${index}`,
      };

      messages.push(message);
      historyEntries.push({
        historyId: currentHistoryId,
        messageId: message.id,
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
      sendJson(response, 200, {
        emailAddress,
        historyId: String(currentHistoryId),
      });
      return;
    }

    if (request.method === "GET" && url.pathname === "/gmail/v1/users/me/history") {
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

      sendJson(response, 200, {
        history: historyEntries
          .filter((entry) => entry.historyId > startHistoryIdNumber)
          .map((entry) => ({
            messagesAdded: [
              {
                message: {
                  id: entry.messageId,
                },
              },
            ],
          })),
        historyId: String(currentHistoryId),
      });
      return;
    }

    if (request.method === "GET" && url.pathname === "/gmail/v1/users/me/messages") {
      sendJson(response, 200, {
        messages: messages.map((message) => ({
          id: message.id,
        })),
      });
      return;
    }

    if (request.method === "GET" && url.pathname.startsWith("/gmail/v1/users/me/messages/")) {
      const pauseGate = nextMessagePause;

      if (pauseGate !== null) {
        nextMessagePause = null;
        await pauseGate.pause();
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
    pauseNextMessageFetch: () => {
      const pauseGate = createPauseGate();
      nextMessagePause = pauseGate;
      return pauseGate;
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

const startWebhookReceiver = async () => {
  const server = await startHttpServer(async (_request, response) => {
    sendJson(response, 202, {
      accepted: true,
    });
  });

  return {
    close: server.close,
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
      id: "wak_worker_death_chaos",
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
    const [mailbox, messages, syncRuns, threads, mailboxEvents] = await Promise.all([
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
    ]);

    return {
      mailbox,
      mailboxEvents,
      messages,
      syncRuns,
      threads,
    };
  } finally {
    await database.client.end();
  }
};

const readCanonicalFingerprint = (state: Awaited<ReturnType<typeof readMailboxPersistence>>) => ({
  cursor: state.mailbox?.cursor ?? null,
  mailboxEventCount: state.mailboxEvents.length,
  messageCount: state.messages.length,
  threadCount: state.threads.length,
});

const createWorkerEnv = (
  connectionString: string,
  sandbox: Awaited<ReturnType<typeof startGmailSandbox>>,
  workerBaseUrl: string,
  port: number,
): WorkerEnv => ({
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
  mailboxSyncHeartbeatIntervalMs: chaosHeartbeatIntervalMs,
  mailboxSyncLeaseTtlMs: chaosLeaseTtlMs,
  nodeEnv: "test",
  port,
  stagingPubSubRetrySmokeMailboxIds: [],
  workerBaseUrl,
});

const waitForWorkerHealth = async (
  child: ChildProcessWithoutNullStreams,
  workerBaseUrl: string,
  output: ReadonlyArray<string>,
) => {
  const startedAt = Date.now();

  while (Date.now() - startedAt < 10_000) {
    if (child.exitCode !== null) {
      throw new Error(`Worker child exited before readiness.\n${output.join("")}`);
    }

    try {
      const response = await fetch(`${workerBaseUrl}/health`);

      if (response.ok) {
        return;
      }
    } catch {
      // Keep polling until the worker binds its port.
    }

    await new Promise((resolve) => {
      globalThis.setTimeout(resolve, 50);
    });
  }

  throw new Error(`Timed out waiting for worker child readiness.\n${output.join("")}`);
};

const startWorkerChildProcess = async (
  env: WorkerEnv,
): Promise<{
  readonly getOutput: () => string;
  readonly kill: () => Promise<void>;
}> => {
  const output: string[] = [];
  const childEntrypoint = `
    import { startWorkerRuntime } from "./apps/worker/src/index.ts";

    const main = async () => {
    const requireEnv = (name) => {
      const value = process.env[name];

      if (value === undefined || value.length === 0) {
        throw new Error(\`\${name} is required for the worker chaos child.\`);
      }

      return value;
    };

    const optionalEnv = (name) => {
      const value = process.env[name];
      return value === undefined || value.length === 0 ? null : value;
    };

    const runtime = await startWorkerRuntime({
      asyncTransportMode: "local",
      databaseUrl: requireEnv("DATABASE_URL"),
      gmailApiBaseUrl: requireEnv("MAILMON_GMAIL_API_BASE_URL"),
      gmailOauthClientId: optionalEnv("MAILMON_GMAIL_OAUTH_CLIENT_ID"),
      gmailOauthClientSecret: optionalEnv("MAILMON_GMAIL_OAUTH_CLIENT_SECRET"),
      gmailRefreshTokenEncryptionKey: requireEnv("MAILMON_GMAIL_REFRESH_TOKEN_ENCRYPTION_KEY"),
      gmailRefreshTokenEncryptionKeyId: requireEnv("MAILMON_GMAIL_REFRESH_TOKEN_ENCRYPTION_KEY_ID"),
      gmailRefreshTokenPreviousEncryptionKeys: [],
      gmailOauthTokenUrl: requireEnv("MAILMON_GMAIL_OAUTH_TOKEN_URL"),
      gmailPubSubTopicName: null,
      syncDispatchPubSubTopicName: null,
      gcpProjectId: null,
      gcpRegion: null,
      gcpSchedulerServiceAccountEmail: null,
      gcpTasksAudience: null,
      gcpTasksServiceAccountEmail: null,
      gcpWebhookDeliveryQueueId: "mailmon-webhook-deliveries",
      host: requireEnv("HOST"),
      mailboxSyncHeartbeatIntervalMs: Number.parseInt(
        requireEnv("MAILMON_SYNC_HEARTBEAT_INTERVAL_MS"),
        10,
      ),
      mailboxSyncLeaseTtlMs: Number.parseInt(requireEnv("MAILMON_SYNC_LEASE_TTL_MS"), 10),
      nodeEnv: "test",
      port: Number.parseInt(requireEnv("PORT"), 10),
      stagingPubSubRetrySmokeMailboxIds: [],
      workerBaseUrl: requireEnv("MAILMON_WORKER_BASE_URL"),
    });

    const shutdown = async () => {
      await runtime.close();
    };

    process.on("SIGINT", () => {
      void shutdown();
    });
    process.on("SIGTERM", () => {
      void shutdown();
    });
    };

    void main();
  `;
  const child = spawn(tsxBin, ["-e", childEntrypoint], {
    cwd: repoRoot,
    detached: true,
    env: {
      ...process.env,
      DATABASE_URL: env.databaseUrl,
      HOST: env.host,
      MAILMON_ASYNC_TRANSPORT_MODE: env.asyncTransportMode,
      MAILMON_GMAIL_API_BASE_URL: env.gmailApiBaseUrl,
      MAILMON_GMAIL_OAUTH_CLIENT_ID: env.gmailOauthClientId ?? "",
      MAILMON_GMAIL_OAUTH_CLIENT_SECRET: env.gmailOauthClientSecret ?? "",
      MAILMON_GMAIL_OAUTH_TOKEN_URL: env.gmailOauthTokenUrl,
      MAILMON_GMAIL_REFRESH_TOKEN_ENCRYPTION_KEY: env.gmailRefreshTokenEncryptionKey,
      MAILMON_GMAIL_REFRESH_TOKEN_ENCRYPTION_KEY_ID: env.gmailRefreshTokenEncryptionKeyId,
      MAILMON_SYNC_HEARTBEAT_INTERVAL_MS: String(env.mailboxSyncHeartbeatIntervalMs),
      MAILMON_SYNC_LEASE_TTL_MS: String(env.mailboxSyncLeaseTtlMs),
      MAILMON_WORKER_BASE_URL: env.workerBaseUrl,
      NODE_ENV: env.nodeEnv,
      PORT: String(env.port),
    },
  });
  const exitPromise = new Promise<void>((resolve) => {
    child.once("exit", () => {
      resolve();
    });
  });

  child.stdout.on("data", (chunk: Buffer) => {
    output.push(chunk.toString("utf8"));
  });
  child.stderr.on("data", (chunk: Buffer) => {
    output.push(chunk.toString("utf8"));
  });

  await waitForWorkerHealth(child, env.workerBaseUrl, output);

  return {
    getOutput: () => output.join(""),
    kill: async () => {
      if (child.exitCode === null) {
        if (child.pid === undefined) {
          child.kill("SIGKILL");
        } else {
          process.kill(-child.pid, "SIGKILL");
        }
      }

      await exitPromise;
    },
  };
};

const connectSandboxMailbox = async (
  harness: Pick<WorkerDeathChaosHarness, "apiHeaders" | "apiOrigin" | "app">,
) => {
  const connectSessionResponse = await harness.app.request(
    `${harness.apiOrigin}/v1/mailboxes/connect-sessions`,
    {
      method: "POST",
      headers: harness.apiHeaders,
      body: JSON.stringify({
        provider: "gmail",
        tenantExternalId: "tenant_worker_death",
        mailboxExternalId: "mailbox_worker_death",
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

  if (authorizationUrl === null) {
    throw new Error("Expected hosted connect to redirect to the sandbox authorization URL.");
  }

  const sandboxAuthorizationResponse = await fetch(authorizationUrl, {
    redirect: "manual",
  });

  expect(sandboxAuthorizationResponse.status).toBe(302);

  const callbackUrl = sandboxAuthorizationResponse.headers.get("location");

  if (callbackUrl === null) {
    throw new Error("Expected sandbox authorization to redirect to the callback URL.");
  }

  const callbackResponse = await harness.app.request(callbackUrl);

  expect(callbackResponse.status).toBe(302);

  const frontendRedirectLocation = callbackResponse.headers.get("location");

  if (frontendRedirectLocation === null) {
    throw new Error("Expected the callback to redirect back to the client redirect URL.");
  }

  const mailboxId = new URL(frontendRedirectLocation).searchParams.get("mailbox_id");

  if (mailboxId === null) {
    throw new Error("Expected hosted connect callback to return a mailbox_id.");
  }

  return mailboxId;
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

const runWorkerControlJob = async (workerBaseUrl: string, kind: "recover_stuck_syncs") => {
  const response = await fetch(`${workerBaseUrl}/internal/control-jobs`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      kind,
    }),
  });

  return {
    body: await readJsonResponse(response),
    status: response.status,
  };
};

interface WorkerDeathChaosHarness {
  readonly apiHeaders: Readonly<Record<string, string>>;
  readonly apiOrigin: string;
  readonly app: ReturnType<typeof createApp>;
  readonly close: () => Promise<void>;
  readonly sandbox: Awaited<ReturnType<typeof startGmailSandbox>>;
  readonly startWorkerA: () => Promise<Awaited<ReturnType<typeof startWorkerChildProcess>>>;
  readonly workerABaseUrl: string;
  readonly workerBBaseUrl: string;
}

const startWorkerDeathChaosHarness = async (
  connectionString: string,
): Promise<WorkerDeathChaosHarness> => {
  const workerAPort = await reservePort();
  const workerBPort = await reservePort();
  const workerABaseUrl = `http://127.0.0.1:${workerAPort}`;
  const workerBBaseUrl = `http://127.0.0.1:${workerBPort}`;
  const sandbox = await startGmailSandbox("worker-death@mailmon.dev");
  const webhookReceiver = await startWebhookReceiver();
  let workerBRuntime: WorkerRuntimeHandle | null = null;
  let apiRuntime: ReturnType<typeof createApiRuntime> | null = null;

  const close = async () => {
    await Promise.all([
      apiRuntime?.dispose(),
      workerBRuntime?.close(),
      webhookReceiver.close(),
      sandbox.close(),
    ]);
  };

  try {
    await seedWorkspaceApiKey(connectionString);

    workerBRuntime = await startWorkerRuntime(
      createWorkerEnv(connectionString, sandbox, workerBBaseUrl, workerBPort),
    );

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
      workerBaseUrl: workerBBaseUrl,
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
      startWorkerA: () =>
        startWorkerChildProcess(
          createWorkerEnv(connectionString, sandbox, workerABaseUrl, workerAPort),
        ),
      workerABaseUrl,
      workerBBaseUrl,
    };
  } catch (error) {
    await close();
    throw error;
  }
};

describe("worker-death-lease-expiry-takeover chaos", () => {
  it("worker-death-lease-expiry-takeover: recovers after killing a real worker mid-sync", async () => {
    await withIsolatedDatabasePromise(async ({ connectionString }) => {
      const harness = await startWorkerDeathChaosHarness(connectionString);
      let workerA: Awaited<ReturnType<typeof startWorkerChildProcess>> | null = null;

      try {
        const mailboxId = await connectSandboxMailbox(harness);

        await waitFor(
          () => readMailboxPersistence(connectionString, mailboxId),
          (value) => value.mailbox?.cursor === "1",
        );

        workerA = await harness.startWorkerA();

        const sentMessage = await harness.sandbox.sendEmail({
          to: harness.sandbox.emailAddress,
          fromEmail: "chaos@sandbox.mailmon.dev",
          fromName: "Sandbox Chaos",
          subject: "Worker death takeover",
          snippet: "This message should be committed by worker B only.",
        });
        const pauseGate = harness.sandbox.pauseNextMessageFetch();
        const stateBeforeWorkerA = await readMailboxPersistence(connectionString, mailboxId);
        const canonicalStateBeforeWorkerA = readCanonicalFingerprint(stateBeforeWorkerA);
        const workerASync = runWorkerSync(harness.workerABaseUrl, mailboxId).then(
          (result) => ({ kind: "resolved" as const, result }),
          (error: unknown) => ({ error, kind: "rejected" as const }),
        );

        const pauseOrWorkerACompletion = await withTimeout(
          Promise.race([
            pauseGate.waitUntilPaused().then(() => ({ kind: "paused" as const })),
            workerASync.then((outcome) => ({ kind: "completed" as const, outcome })),
          ]),
          10_000,
          "worker A provider pause",
        );

        if (pauseOrWorkerACompletion.kind === "completed") {
          const stateAfterUnexpectedWorkerACompletion = await readMailboxPersistence(
            connectionString,
            mailboxId,
          );
          throw new Error(
            `Worker A completed before the sandbox pause point: ${JSON.stringify(pauseOrWorkerACompletion.outcome)}\n${JSON.stringify(
              {
                mailbox: stateAfterUnexpectedWorkerACompletion.mailbox,
                syncRuns: stateAfterUnexpectedWorkerACompletion.syncRuns,
              },
              null,
              2,
            )}\n${workerA?.getOutput() ?? ""}`,
          );
        }

        const leasedState = await waitFor(
          () => readMailboxPersistence(connectionString, mailboxId),
          (value) =>
            value.mailbox?.activeSyncLeaseOwner !== null &&
            value.mailbox?.activeSyncRunId !== null &&
            value.syncRuns.some(
              (syncRun) =>
                syncRun.id === value.mailbox?.activeSyncRunId && syncRun.status === "running",
            ),
        );
        const originalSyncRunId = leasedState.mailbox?.activeSyncRunId;
        const originalLeaseOwner = leasedState.mailbox?.activeSyncLeaseOwner;

        expect(originalSyncRunId).toEqual(expect.any(String));
        expect(originalLeaseOwner).toEqual(expect.any(String));

        await workerA.kill();
        workerA = null;
        pauseGate.release();

        const workerAOutcome = await withTimeout(workerASync, 5_000, "worker A sync shutdown");

        expect(workerAOutcome.kind).toBe("rejected");

        const stateAfterWorkerDeath = await readMailboxPersistence(connectionString, mailboxId);

        expect(readCanonicalFingerprint(stateAfterWorkerDeath)).toEqual(
          canonicalStateBeforeWorkerA,
        );
        expect(stateAfterWorkerDeath.mailbox).toMatchObject({
          activeSyncLeaseOwner: originalLeaseOwner,
          activeSyncRunId: originalSyncRunId,
          cursor: canonicalStateBeforeWorkerA.cursor,
        });

        await waitFor(
          () => readMailboxPersistence(connectionString, mailboxId),
          (value) => {
            const expiresAt = value.mailbox?.activeSyncLeaseExpiresAt;

            return expiresAt instanceof Date && expiresAt.getTime() <= Date.now();
          },
          {
            timeoutMs: 5_000,
          },
        );

        const recovery = await runWorkerControlJob(harness.workerBBaseUrl, "recover_stuck_syncs");

        expect(recovery.status).toBe(200);
        expect(recovery.body).toMatchObject({
          dispatched: 1,
          kind: "recover_stuck_syncs",
          recovered: 1,
          recoveredExecutions: [
            {
              leaseOwnerId: originalLeaseOwner,
              mailboxId,
              syncRunId: originalSyncRunId,
            },
          ],
          status: "completed",
        });

        const finalState = await waitFor(
          () => readMailboxPersistence(connectionString, mailboxId),
          (value) =>
            value.mailbox?.activeSyncLeaseOwner === null &&
            value.mailbox?.cursor === sentMessage.historyId &&
            value.messages.length === 1 &&
            value.mailboxEvents.length === 2,
        );
        const originalSyncRun = finalState.syncRuns.find(
          (syncRun) => syncRun.id === originalSyncRunId,
        );
        const takeoverSyncRun = finalState.syncRuns.find(
          (syncRun) =>
            syncRun.id !== originalSyncRunId &&
            syncRun.status === "completed" &&
            syncRun.nextCursor === sentMessage.historyId,
        );

        expect(originalSyncRun).toMatchObject({
          detail: "stuck_mailbox_execution_recovered",
          eventsEmitted: "0",
          mailboxId,
          nextCursor: null,
          status: "lease_lost",
        });
        expect(takeoverSyncRun).toMatchObject({
          eventsEmitted: "2",
          mailboxId,
          nextCursor: sentMessage.historyId,
          previousCursor: canonicalStateBeforeWorkerA.cursor,
          status: "completed",
        });
        expect(finalState.mailbox).toMatchObject({
          activeSyncLeaseOwner: null,
          activeSyncRunId: null,
          cursor: sentMessage.historyId,
          status: "active",
          syncState: "healthy",
        });
        expect(finalState.messages).toEqual([
          expect.objectContaining({
            providerMessageId: sentMessage.messageId,
          }),
        ]);
        expect(finalState.threads).toEqual([
          expect.objectContaining({
            providerThreadId: sentMessage.threadId,
          }),
        ]);
      } finally {
        if (workerA !== null) {
          await workerA.kill();
        }

        await harness.close();
      }
    });
  }, 45_000);
});
