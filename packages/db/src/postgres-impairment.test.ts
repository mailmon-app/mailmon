import {
  MailboxStateStore,
  type MailboxEventEnvelope,
  type MailboxSyncSnapshot,
  WebhookDeliveryStore,
} from "@mailmon/core";
import { createAesGcmGmailRefreshTokenCipherLayer } from "@mailmon/gmail";
import { asc, eq } from "drizzle-orm";
import { Effect, Layer, Option } from "effect";
import { describe, expect, it } from "vitest";

import { createCorePersistenceLayer, createDb, schema } from "./index.js";
import { withIsolatedDatabasePromise } from "./test-setup.js";

const directDatabaseUrl =
  process.env.MAILMON_FAULT_DATABASE_URL ?? "postgres://mailmon:mailmon@localhost:55432/mailmon";
const proxyDatabaseUrl =
  process.env.MAILMON_FAULT_DATABASE_PROXY_URL ??
  "postgres://mailmon:mailmon@localhost:15432/mailmon?connect_timeout=2";
const toxiproxyUrl = process.env.MAILMON_TOXIPROXY_URL ?? "http://localhost:8474";
const toxiproxyProxyName = "mailmon-postgres";
const toxiproxyListen = "0.0.0.0:15432";
const toxiproxyUpstream = "postgres-faults:5432";

const workspaceId = "ws_postgres_impairment";
const mailboxId = "mbx_postgres_impairment";
const tenantExternalId = "tenant_postgres_impairment";
const activeLeaseOwnerId = "lease_postgres_impairment";
const syncRunId = "sr_postgres_impairment";
const webhookEndpointId = "whe_postgres_impairment";
const mailboxEventId = "evt_postgres_impairment";
const webhookDeliveryId = "del_postgres_impairment";

const testGmailRefreshTokenCipherLayer = createAesGcmGmailRefreshTokenCipherLayer({
  allowPlaintextFallback: true,
  encryptionKey: "BwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwc=",
});

const snapshotFixture = {
  deletedProviderMessageIds: [],
  messages: [
    {
      id: "msg_postgres_impairment",
      threadId: "thr_postgres_impairment",
      providerMessageId: "gmail_msg_postgres_impairment",
      providerThreadId: "gmail_thr_postgres_impairment",
      subject: "Postgres impairment fixture",
      from: {
        name: "Mailmon Fault Harness",
        email: "faults@mailmon.dev",
      },
      snippet: "This message must be all-or-nothing under a proxy fault.",
      receivedAt: "2026-05-18T10:00:00.000Z",
      labelIds: ["INBOX"],
    },
  ],
  threads: [
    {
      id: "thr_postgres_impairment",
      providerThreadId: "gmail_thr_postgres_impairment",
      subject: "Postgres impairment fixture",
      lastMessageAt: "2026-05-18T10:00:00.000Z",
    },
  ],
} satisfies MailboxSyncSnapshot;

const mailboxEventFixture: MailboxEventEnvelope = {
  id: mailboxEventId,
  type: "message.created",
  occurredAt: "2026-05-18T10:01:00.000Z",
  workspaceId,
  tenantExternalId,
  mailboxId,
  schemaVersion: 1,
  data: {
    messageId: snapshotFixture.messages[0].id,
    threadId: snapshotFixture.messages[0].threadId,
    providerMessageId: snapshotFixture.messages[0].providerMessageId,
    providerThreadId: snapshotFixture.messages[0].providerThreadId,
    subject: snapshotFixture.messages[0].subject,
    snippet: snapshotFixture.messages[0].snippet,
    receivedAt: snapshotFixture.messages[0].receivedAt,
    labelIds: snapshotFixture.messages[0].labelIds,
  },
};

const withDatabaseName = (connectionString: string, databaseName: string) => {
  const url = new URL(connectionString);

  url.pathname = `/${databaseName}`;

  return url.toString();
};

const withConnectionParam = (connectionString: string, name: string, value: string) => {
  const url = new URL(connectionString);

  url.searchParams.set(name, value);

  return url.toString();
};

const createProxyConnectionString = (databaseName: string, applicationName: string) =>
  withConnectionParam(
    withDatabaseName(proxyDatabaseUrl, databaseName),
    "application_name",
    applicationName,
  );

const timeoutSignal = (milliseconds: number) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort();
  }, milliseconds);

  return {
    signal: controller.signal,
    clear: () => {
      clearTimeout(timeout);
    },
  };
};

const toxiproxyRequest = async (
  path: string,
  options: RequestInit & { readonly allowNotFound?: boolean } = {},
) => {
  const { allowNotFound = false, ...requestOptions } = options;
  const response = await fetch(`${toxiproxyUrl}${path}`, requestOptions);

  if (allowNotFound && response.status === 404) {
    return response;
  }

  if (!response.ok) {
    throw new Error(
      `Toxiproxy request ${requestOptions.method ?? "GET"} ${path} failed with ${response.status}: ${await response.text()}`,
    );
  }

  return response;
};

const toxiproxyIsAvailable = async () => {
  const { signal, clear } = timeoutSignal(500);

  try {
    const response = await fetch(`${toxiproxyUrl}/version`, { signal });

    return response.ok;
  } catch {
    return false;
  } finally {
    clear();
  }
};

const resetPostgresProxy = async () => {
  await toxiproxyRequest(`/proxies/${toxiproxyProxyName}`, {
    method: "DELETE",
    allowNotFound: true,
  });
  await toxiproxyRequest("/proxies", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      name: toxiproxyProxyName,
      listen: toxiproxyListen,
      upstream: toxiproxyUpstream,
      enabled: true,
    }),
  });
};

const deletePostgresProxy = async () => {
  await toxiproxyRequest(`/proxies/${toxiproxyProxyName}`, {
    method: "DELETE",
    allowNotFound: true,
  });
};

const addToxic = async (
  params: Readonly<{
    name: string;
    type: "latency" | "reset_peer";
    stream?: "upstream" | "downstream";
    attributes: Readonly<Record<string, number>>;
  }>,
) => {
  await toxiproxyRequest(`/proxies/${toxiproxyProxyName}/toxics`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      name: params.name,
      type: params.type,
      stream: params.stream ?? "upstream",
      toxicity: 1,
      attributes: params.attributes,
    }),
  });
};

const maybeWithFaultHarness = async (run: () => Promise<void>) => {
  if (!(await toxiproxyIsAvailable())) {
    if (process.env.MAILMON_REQUIRE_DB_IMPAIRMENT_TESTS === "1") {
      throw new Error(
        `Toxiproxy is not reachable at ${toxiproxyUrl}. Run docker compose -f docker-compose.test-faults.yml up -d first.`,
      );
    }

    console.warn(
      `Skipping PostgreSQL impairment checks because Toxiproxy is not reachable at ${toxiproxyUrl}.`,
    );
    return;
  }

  await resetPostgresProxy();

  try {
    await run();
  } finally {
    await resetPostgresProxy();
  }
};

const seedMailboxFixture = async (connectionString: string) => {
  const database = createDb(connectionString);

  try {
    const now = new Date();

    await database.db.insert(schema.workspaces).values({
      id: workspaceId,
    });
    await database.db.insert(schema.mailboxes).values({
      id: mailboxId,
      workspaceId,
      provider: "gmail",
      tenantExternalId,
      mailboxExternalId: "mailbox_external_postgres_impairment",
      emailAddress: "postgres-impairment@mailmon.dev",
      cursor: "100",
      status: "active",
      syncState: "healthy",
      watchState: "active",
      activeSyncLeaseOwner: activeLeaseOwnerId,
      activeSyncLeaseAcquiredAt: now,
      activeSyncLeaseHeartbeatAt: now,
      activeSyncLeaseExpiresAt: new Date(now.getTime() + 300_000),
      activeSyncRunId: syncRunId,
    });
    await database.db.insert(schema.syncRuns).values({
      id: syncRunId,
      mailboxId,
      status: "running",
      leaseOwnerId: activeLeaseOwnerId,
      startedAt: now,
    });
  } finally {
    await database.client.end();
  }
};

const seedWebhookFixture = async (connectionString: string) => {
  const database = createDb(connectionString);

  try {
    const createdAt = new Date("2026-05-18T10:01:00.000Z");

    await database.db.insert(schema.workspaces).values({
      id: workspaceId,
    });
    await database.db.insert(schema.mailboxes).values({
      id: mailboxId,
      workspaceId,
      provider: "gmail",
      tenantExternalId,
      mailboxExternalId: "mailbox_external_webhook_impairment",
      emailAddress: "webhook-impairment@mailmon.dev",
      status: "active",
      syncState: "healthy",
      watchState: "active",
    });
    await database.db.insert(schema.webhookEndpoints).values({
      id: webhookEndpointId,
      workspaceId,
      url: "https://app.example.com/webhooks/postgres-impairment",
      description: "postgres impairment fixture",
      signingSecret: "whsec_postgres_impairment",
      deliveryState: "healthy",
    });
    await database.db.insert(schema.mailboxEvents).values({
      id: mailboxEventId,
      mailboxId,
      eventType: mailboxEventFixture.type,
      occurredAt: new Date(mailboxEventFixture.occurredAt),
      payload: mailboxEventFixture,
    });
    await database.db.insert(schema.webhookDeliveries).values({
      id: webhookDeliveryId,
      mailboxEventId,
      webhookEndpointId,
      state: "pending",
      attemptCount: 0,
      nextAttemptAt: createdAt,
      createdAt,
      updatedAt: createdAt,
    });
  } finally {
    await database.client.end();
  }
};

const applyMailboxSyncResult = (
  connectionString: string,
  params: Readonly<{
    nextCursor: string;
  }>,
) =>
  Effect.gen(function* () {
    const mailboxStateStore = yield* MailboxStateStore;

    return yield* mailboxStateStore.applySyncResult({
      eventsEmitted: snapshotFixture.messages.length,
      mailboxId,
      leaseOwnerId: activeLeaseOwnerId,
      nextCursor: params.nextCursor,
      snapshot: snapshotFixture,
      syncRunId,
      syncedAt: "2026-05-18T10:02:00.000Z",
    });
  }).pipe(
    Effect.provide(
      createCorePersistenceLayer(connectionString).pipe(
        Layer.provide(testGmailRefreshTokenCipherLayer),
      ),
    ),
  );

const prepareWebhookDeliveryAttempt = (connectionString: string, attemptedAt: string) =>
  Effect.gen(function* () {
    const webhookDeliveryStore = yield* WebhookDeliveryStore;

    return yield* webhookDeliveryStore.prepareWebhookDeliveryAttempt(
      webhookDeliveryId,
      attemptedAt,
    );
  }).pipe(
    Effect.provide(
      createCorePersistenceLayer(connectionString).pipe(
        Layer.provide(testGmailRefreshTokenCipherLayer),
      ),
    ),
  );

const completeWebhookDeliveryAttempt = (
  connectionString: string,
  prepared: import("@mailmon/core").PreparedWebhookDelivery,
) =>
  Effect.gen(function* () {
    const webhookDeliveryStore = yield* WebhookDeliveryStore;

    return yield* webhookDeliveryStore.completeWebhookDeliveryAttempt({
      deliveryId: prepared.deliveryId,
      attemptCount: prepared.attemptCount,
      processingStartedAt: prepared.processingStartedAt,
      state: "delivered",
      completedAt: "2026-05-18T10:04:00.000Z",
      nextAttemptAt: null,
      responseStatusCode: 204,
      errorCode: null,
      errorMessage: null,
      retryable: null,
    });
  }).pipe(
    Effect.provide(
      createCorePersistenceLayer(connectionString).pipe(
        Layer.provide(testGmailRefreshTokenCipherLayer),
      ),
    ),
  );

const fetchSyncState = async (connectionString: string) => {
  const database = createDb(connectionString);

  try {
    const [mailbox] = await database.db
      .select()
      .from(schema.mailboxes)
      .where(eq(schema.mailboxes.id, mailboxId))
      .limit(1);
    const syncRuns = await database.db
      .select()
      .from(schema.syncRuns)
      .orderBy(asc(schema.syncRuns.startedAt), asc(schema.syncRuns.id));
    const messages = await database.db
      .select()
      .from(schema.messages)
      .orderBy(asc(schema.messages.id));
    const threads = await database.db.select().from(schema.threads).orderBy(asc(schema.threads.id));
    const mailboxEvents = await database.db
      .select()
      .from(schema.mailboxEvents)
      .orderBy(asc(schema.mailboxEvents.id));

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

const fetchWebhookState = async (connectionString: string) => {
  const database = createDb(connectionString);

  try {
    const [delivery] = await database.db
      .select()
      .from(schema.webhookDeliveries)
      .where(eq(schema.webhookDeliveries.id, webhookDeliveryId))
      .limit(1);
    const [endpoint] = await database.db
      .select()
      .from(schema.webhookEndpoints)
      .where(eq(schema.webhookEndpoints.id, webhookEndpointId))
      .limit(1);

    return {
      delivery,
      endpoint,
    };
  } finally {
    await database.client.end();
  }
};

const expectCompleteSyncOutcome = (state: Awaited<ReturnType<typeof fetchSyncState>>) => {
  expect(state.mailbox).toMatchObject({
    id: mailboxId,
    cursor: "101",
    activeSyncLeaseOwner: null,
    activeSyncRunId: null,
    syncState: "healthy",
    lastErrorCode: null,
  });
  expect(state.syncRuns).toEqual([
    expect.objectContaining({
      id: syncRunId,
      status: "completed",
      previousCursor: "100",
      nextCursor: "101",
      eventsEmitted: "2",
    }),
  ]);
  expect(state.messages).toHaveLength(1);
  expect(state.threads).toHaveLength(1);
  expect(state.mailboxEvents).toHaveLength(2);
};

describe("postgres-impairment-does-not-partially-commit", () => {
  it("completes mailbox sync commit through proxy latency as a valid complete outcome", async () => {
    await maybeWithFaultHarness(async () => {
      await withIsolatedDatabasePromise(
        async (database) => {
          const proxyConnectionString = createProxyConnectionString(
            database.databaseName,
            "mailmon_sync_latency",
          );

          await seedMailboxFixture(database.connectionString);
          await addToxic({
            name: "sync-commit-latency",
            type: "latency",
            stream: "downstream",
            attributes: {
              latency: 200,
              jitter: 0,
            },
          });

          const commitResult = await Effect.runPromise(
            applyMailboxSyncResult(proxyConnectionString, { nextCursor: "101" }),
          );
          const stateAfterCommit = await fetchSyncState(database.connectionString);

          expect(commitResult).toEqual({
            applied: true,
            mailboxEventIds: expect.arrayContaining([
              expect.stringMatching(/^evt_/),
              expect.stringMatching(/^evt_/),
            ]),
          });
          expect(commitResult.mailboxEventIds).toHaveLength(2);
          expectCompleteSyncOutcome(stateAfterCommit);
        },
        { databaseUrl: directDatabaseUrl },
      );
    });
  }, 30_000);

  it("leaves mailbox sync commit state unchanged when the proxied connection drops", async () => {
    await maybeWithFaultHarness(async () => {
      await withIsolatedDatabasePromise(
        async (database) => {
          const proxyConnectionString = createProxyConnectionString(
            database.databaseName,
            "mailmon_sync_drop",
          );

          await seedMailboxFixture(database.connectionString);
          const stateBeforeCommit = await fetchSyncState(database.connectionString);
          await deletePostgresProxy();

          const commitExit = await Effect.runPromiseExit(
            applyMailboxSyncResult(proxyConnectionString, { nextCursor: "101" }),
          );
          const stateAfterCommit = await fetchSyncState(database.connectionString);

          expect(commitExit._tag).toBe("Failure");
          expect(stateAfterCommit).toEqual(stateBeforeCommit);
        },
        { databaseUrl: directDatabaseUrl },
      );
    });
  }, 30_000);

  it("claims a webhook delivery through proxy latency as a valid complete claim outcome", async () => {
    await maybeWithFaultHarness(async () => {
      await withIsolatedDatabasePromise(
        async (database) => {
          const proxyConnectionString = createProxyConnectionString(
            database.databaseName,
            "mailmon_webhook_claim_latency",
          );
          const attemptedAt = "2026-05-18T10:03:00.000Z";

          await seedWebhookFixture(database.connectionString);
          await addToxic({
            name: "webhook-claim-latency",
            type: "latency",
            stream: "downstream",
            attributes: {
              latency: 200,
              jitter: 0,
            },
          });

          const prepared = await Effect.runPromise(
            prepareWebhookDeliveryAttempt(proxyConnectionString, attemptedAt),
          );
          const delivery = Option.getOrThrow(prepared);
          const stateAfterClaim = await fetchWebhookState(database.connectionString);

          expect(delivery).toMatchObject({
            deliveryId: webhookDeliveryId,
            attemptCount: 1,
            processingStartedAt: attemptedAt,
          });
          expect(stateAfterClaim.delivery).toMatchObject({
            id: webhookDeliveryId,
            state: "processing",
            attemptCount: 1,
            lastAttemptedAt: new Date(attemptedAt),
            processingStartedAt: new Date(attemptedAt),
          });
          expect(stateAfterClaim.endpoint).toMatchObject({
            id: webhookEndpointId,
            deliveryState: "healthy",
            consecutiveDeliveryFailures: 0,
          });
        },
        { databaseUrl: directDatabaseUrl },
      );
    });
  }, 30_000);

  it("leaves webhook delivery state unchanged when finalize loses its proxied connection", async () => {
    await maybeWithFaultHarness(async () => {
      await withIsolatedDatabasePromise(
        async (database) => {
          const proxyConnectionString = createProxyConnectionString(
            database.databaseName,
            "mailmon_webhook_finalize_drop",
          );
          const attemptedAt = "2026-05-18T10:03:00.000Z";

          await seedWebhookFixture(database.connectionString);
          const prepared = Option.getOrThrow(
            await Effect.runPromise(
              prepareWebhookDeliveryAttempt(proxyConnectionString, attemptedAt),
            ),
          );
          const stateAfterClaim = await fetchWebhookState(database.connectionString);
          await deletePostgresProxy();

          const completionExit = await Effect.runPromiseExit(
            completeWebhookDeliveryAttempt(proxyConnectionString, prepared),
          );
          const stateAfterFailedCompletion = await fetchWebhookState(database.connectionString);

          expect(completionExit._tag).toBe("Failure");
          expect(stateAfterFailedCompletion).toEqual(stateAfterClaim);
        },
        { databaseUrl: directDatabaseUrl },
      );
    });
  }, 30_000);
});
