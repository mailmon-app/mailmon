import { randomUUID } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";

import {
  recoverWebhookDeliveryScheduling,
  runWebhookDelivery,
  scheduleMailboxEventDeliveries,
  type MailboxEventEnvelope,
  WebhookDeliveryScheduler,
  WebhookDeliverySender,
  WebhookDeliveryStore,
} from "@mailmon/core";
import { eq } from "drizzle-orm";
import { Effect, Layer, Option } from "effect";
import postgres from "postgres";
import { describe, expect, it } from "vitest";

import { createCorePersistenceLayer, createDb, schema } from "./index.js";

const DEFAULT_DATABASE_URL =
  process.env.DATABASE_URL ?? "postgres://mailmon:mailmon@localhost:5432/mailmon";
const migrationDirectory = new URL("../drizzle/", import.meta.url);
const workspaceId = "ws_delivery";
const mailboxId = "mbx_delivery";
const webhookEndpointId = "whe_delivery";
const mailboxEventId = "evt_delivery";

interface IsolatedDatabase {
  readonly adminConnectionString: string;
  readonly connectionString: string;
  readonly databaseName: string;
}

const withDatabaseName = (connectionString: string, databaseName: string) => {
  const url = new URL(connectionString);
  url.pathname = `/${databaseName}`;

  return url.toString();
};

const toAdminConnectionString = (connectionString: string) => {
  return withDatabaseName(connectionString, "postgres");
};

const createDatabaseName = () => {
  return `mailmon_test_${randomUUID().replaceAll("-", "")}`;
};

const addMillisecondsToIsoTimestamp = (timestamp: string, milliseconds: number) => {
  return new Date(Date.parse(timestamp) + milliseconds).toISOString();
};

const readMigrationStatements = async () => {
  const entries = await readdir(migrationDirectory);
  const migrationFiles = entries.filter((entry) => entry.endsWith(".sql"));
  // oxlint-disable-next-line unicorn/no-array-sort
  migrationFiles.sort((left, right) => left.localeCompare(right));

  const statements = await Promise.all(
    migrationFiles.map(async (migrationFile: string) => {
      const sqlText = await readFile(
        new URL(`../drizzle/${migrationFile}`, import.meta.url),
        "utf8",
      );

      return sqlText
        .split("--> statement-breakpoint")
        .map((statement) => statement.trim())
        .filter((statement) => statement.length > 0);
    }),
  );

  return statements.flat();
};

const applyMigrations = async (connectionString: string) => {
  const client = postgres(connectionString, { max: 1 });

  try {
    for (const statement of await readMigrationStatements()) {
      await client.unsafe(statement);
    }
  } finally {
    await client.end();
  }
};

const createIsolatedDatabase = async (): Promise<IsolatedDatabase> => {
  const databaseName = createDatabaseName();
  const adminConnectionString = toAdminConnectionString(DEFAULT_DATABASE_URL);
  const connectionString = withDatabaseName(DEFAULT_DATABASE_URL, databaseName);
  const adminClient = postgres(adminConnectionString, { max: 1 });

  try {
    await adminClient.unsafe(`CREATE DATABASE "${databaseName}"`);
  } finally {
    await adminClient.end();
  }

  await applyMigrations(connectionString);

  return {
    adminConnectionString,
    connectionString,
    databaseName,
  };
};

const dropIsolatedDatabase = async (database: IsolatedDatabase) => {
  const adminClient = postgres(database.adminConnectionString, { max: 1 });

  try {
    await adminClient.unsafe(`
      SELECT pg_terminate_backend(pid)
      FROM pg_stat_activity
      WHERE datname = '${database.databaseName}'
        AND pid <> pg_backend_pid()
    `);
    await adminClient.unsafe(`DROP DATABASE IF EXISTS "${database.databaseName}"`);
  } finally {
    await adminClient.end();
  }
};

const withIsolatedDatabase = async <T>(run: (database: IsolatedDatabase) => Promise<T>) => {
  const database = await createIsolatedDatabase();

  try {
    return await run(database);
  } finally {
    await dropIsolatedDatabase(database);
  }
};

const mailboxEventFixture: MailboxEventEnvelope = {
  id: mailboxEventId,
  type: "message.created",
  occurredAt: "2026-04-09T10:00:00.000Z",
  workspaceId,
  tenantExternalId: "tenant_delivery",
  mailboxId,
  schemaVersion: 1,
  data: {
    messageId: "msg_delivery",
    threadId: "thr_delivery",
    providerMessageId: "gmail_msg_delivery",
    providerThreadId: "gmail_thr_delivery",
    subject: "Delivery runtime fixture",
    snippet: "Delivery runtime fixture",
    receivedAt: "2026-04-09T10:00:00.000Z",
    labelIds: ["INBOX"],
  },
};

const seedWebhookDeliveryFixture = async (connectionString: string) => {
  const database = createDb(connectionString);

  try {
    await database.db.insert(schema.workspaces).values({
      id: workspaceId,
    });

    await database.db.insert(schema.mailboxes).values({
      id: mailboxId,
      workspaceId,
      provider: "gmail",
      tenantExternalId: "tenant_delivery",
      mailboxExternalId: "mailbox_delivery",
      emailAddress: "delivery@mailmon.dev",
      status: "active",
      syncState: "healthy",
      watchState: "active",
    });

    await database.db.insert(schema.webhookEndpoints).values({
      id: webhookEndpointId,
      workspaceId,
      url: "https://app.example.com/webhooks/mailmon",
      description: "delivery runtime fixture",
      signingSecret: "whsec_delivery_fixture",
      deliveryState: "healthy",
    });

    await database.db.insert(schema.webhookEndpointSubscriptions).values({
      id: "whsub_delivery",
      workspaceId,
      webhookEndpointId,
      mailboxId,
      eventTypes: ["message.created"],
    });

    await database.db.insert(schema.mailboxEvents).values({
      id: mailboxEventFixture.id,
      mailboxId,
      eventType: mailboxEventFixture.type,
      occurredAt: new Date(mailboxEventFixture.occurredAt),
      payload: mailboxEventFixture,
    });
  } finally {
    await database.client.end();
  }
};

const fetchWebhookDelivery = async (connectionString: string, deliveryId: string) => {
  const database = createDb(connectionString);

  try {
    const [row] = await database.db
      .select()
      .from(schema.webhookDeliveries)
      .where(eq(schema.webhookDeliveries.id, deliveryId));

    return row ?? null;
  } finally {
    await database.client.end();
  }
};

const fetchWebhookEndpoint = async (connectionString: string) => {
  const database = createDb(connectionString);

  try {
    const [row] = await database.db
      .select()
      .from(schema.webhookEndpoints)
      .where(eq(schema.webhookEndpoints.id, webhookEndpointId));

    return row ?? null;
  } finally {
    await database.client.end();
  }
};

const resetWebhookDeliveryAvailability = async (
  connectionString: string,
  deliveryId: string,
  nextAttemptAt: string,
) => {
  const database = createDb(connectionString);

  try {
    await database.db
      .update(schema.webhookDeliveries)
      .set({
        nextAttemptAt: new Date(nextAttemptAt),
        state: "pending",
        updatedAt: new Date(nextAttemptAt),
      })
      .where(eq(schema.webhookDeliveries.id, deliveryId));
  } finally {
    await database.client.end();
  }
};

const scheduleDurableWebhookDeliveries = async (
  connectionString: string,
  scheduledDeliveryRequests: Array<{
    deliveryId: string;
    notBefore: string;
  }>,
) => {
  return Effect.runPromise(
    scheduleMailboxEventDeliveries([mailboxEventId]).pipe(
      Effect.provide(
        Layer.mergeAll(
          createCorePersistenceLayer(connectionString),
          Layer.succeed(WebhookDeliveryScheduler, {
            scheduleWebhookDelivery: ({ deliveryId, notBefore }) =>
              Effect.sync(() => {
                scheduledDeliveryRequests.push({
                  deliveryId,
                  notBefore,
                });
              }),
          }),
        ),
      ),
    ),
  );
};

const recoverDurableWebhookDeliveries = async (
  connectionString: string,
  recoveredAt: string,
  scheduledDeliveryRequests: Array<{
    deliveryId: string;
    notBefore: string;
  }>,
) => {
  return Effect.runPromise(
    recoverWebhookDeliveryScheduling(recoveredAt).pipe(
      Effect.provide(
        Layer.mergeAll(
          createCorePersistenceLayer(connectionString),
          Layer.succeed(WebhookDeliveryScheduler, {
            scheduleWebhookDelivery: ({ deliveryId, notBefore }) =>
              Effect.sync(() => {
                scheduledDeliveryRequests.push({
                  deliveryId,
                  notBefore,
                });
              }),
          }),
        ),
      ),
    ),
  );
};

const executeWebhookDelivery = async (
  connectionString: string,
  deliveryId: string,
  scheduledDeliveryRequests: Array<{
    deliveryId: string;
    notBefore: string;
  }>,
  sender: {
    readonly send: (
      delivery: import("@mailmon/core").PreparedWebhookDelivery,
      attemptedAt: string,
    ) => Effect.Effect<
      {
        statusCode: number;
      },
      {
        code: string;
        message: string;
        retryable: boolean;
      }
    >;
  },
) => {
  return Effect.runPromise(
    runWebhookDelivery(deliveryId).pipe(
      Effect.provide(
        Layer.mergeAll(
          createCorePersistenceLayer(connectionString),
          Layer.succeed(WebhookDeliveryScheduler, {
            scheduleWebhookDelivery: ({ deliveryId: rescheduledDeliveryId, notBefore }) =>
              Effect.sync(() => {
                scheduledDeliveryRequests.push({
                  deliveryId: rescheduledDeliveryId,
                  notBefore,
                });
              }),
          }),
          Layer.succeed(WebhookDeliverySender, sender),
        ),
      ),
    ),
  );
};

describe("DB-backed webhook delivery runtime", () => {
  it("schedules durable deliveries and transitions endpoint health across retries and recovery", async () => {
    await withIsolatedDatabase(async (database) => {
      await seedWebhookDeliveryFixture(database.connectionString);

      const scheduledDeliveryRequests: Array<{
        deliveryId: string;
        notBefore: string;
      }> = [];
      const [scheduleRequest] = await scheduleDurableWebhookDeliveries(
        database.connectionString,
        scheduledDeliveryRequests,
      );

      expect(scheduleRequest).toEqual({
        deliveryId: expect.stringMatching(/^del_/),
        notBefore: expect.any(String),
      });
      expect(scheduledDeliveryRequests).toEqual([scheduleRequest]);

      const scheduledDelivery = await fetchWebhookDelivery(
        database.connectionString,
        scheduleRequest.deliveryId,
      );

      expect(scheduledDelivery).toMatchObject({
        id: scheduleRequest.deliveryId,
        mailboxEventId,
        webhookEndpointId,
        state: "pending",
        attemptCount: 0,
      });

      const firstAttempt = await executeWebhookDelivery(
        database.connectionString,
        scheduleRequest.deliveryId,
        scheduledDeliveryRequests,
        {
          send: () =>
            Effect.succeed({
              statusCode: 503,
            }),
        },
      );

      expect(firstAttempt.status).toBe("scheduled_for_retry");
      expect(firstAttempt.nextAttemptAt).toEqual(expect.any(String));
      expect(scheduledDeliveryRequests.at(-1)).toEqual({
        deliveryId: scheduleRequest.deliveryId,
        notBefore: firstAttempt.nextAttemptAt!,
      });

      const firstFailureDelivery = await fetchWebhookDelivery(
        database.connectionString,
        scheduleRequest.deliveryId,
      );
      const firstFailureEndpoint = await fetchWebhookEndpoint(database.connectionString);

      expect(firstFailureDelivery).toMatchObject({
        state: "pending",
        attemptCount: 1,
        lastResponseStatus: 503,
        lastErrorCode: "webhook_endpoint_http_503",
        lastErrorRetryable: true,
      });
      expect(firstFailureEndpoint).toMatchObject({
        deliveryState: "degraded",
        consecutiveDeliveryFailures: 1,
        lastErrorCode: "webhook_endpoint_http_503",
        lastErrorRetryable: true,
      });

      await resetWebhookDeliveryAvailability(
        database.connectionString,
        scheduleRequest.deliveryId,
        new Date(Date.now() - 1_000).toISOString(),
      );

      const secondAttempt = await executeWebhookDelivery(
        database.connectionString,
        scheduleRequest.deliveryId,
        scheduledDeliveryRequests,
        {
          send: () =>
            Effect.fail({
              code: "webhook_delivery_timeout",
              message: "Webhook delivery timed out before the endpoint responded.",
              retryable: true,
            }),
        },
      );

      expect(secondAttempt.status).toBe("scheduled_for_retry");
      expect(scheduledDeliveryRequests.at(-1)).toEqual({
        deliveryId: scheduleRequest.deliveryId,
        notBefore: secondAttempt.nextAttemptAt!,
      });

      const secondFailureEndpoint = await fetchWebhookEndpoint(database.connectionString);

      expect(secondFailureEndpoint).toMatchObject({
        deliveryState: "degraded",
        consecutiveDeliveryFailures: 2,
        lastErrorCode: "webhook_delivery_timeout",
        lastErrorRetryable: true,
      });

      await resetWebhookDeliveryAvailability(
        database.connectionString,
        scheduleRequest.deliveryId,
        new Date(Date.now() - 1_000).toISOString(),
      );

      const thirdAttempt = await executeWebhookDelivery(
        database.connectionString,
        scheduleRequest.deliveryId,
        scheduledDeliveryRequests,
        {
          send: () =>
            Effect.succeed({
              statusCode: 503,
            }),
        },
      );

      expect(thirdAttempt.status).toBe("scheduled_for_retry");
      expect(scheduledDeliveryRequests.at(-1)).toEqual({
        deliveryId: scheduleRequest.deliveryId,
        notBefore: thirdAttempt.nextAttemptAt!,
      });

      const thirdFailureEndpoint = await fetchWebhookEndpoint(database.connectionString);

      expect(thirdFailureEndpoint).toMatchObject({
        deliveryState: "failing",
        consecutiveDeliveryFailures: 3,
        lastErrorCode: "webhook_endpoint_http_503",
        lastErrorRetryable: true,
      });

      await resetWebhookDeliveryAvailability(
        database.connectionString,
        scheduleRequest.deliveryId,
        new Date(Date.now() - 1_000).toISOString(),
      );

      const deliveredAttempt = await executeWebhookDelivery(
        database.connectionString,
        scheduleRequest.deliveryId,
        scheduledDeliveryRequests,
        {
          send: () =>
            Effect.succeed({
              statusCode: 204,
            }),
        },
      );

      expect(deliveredAttempt).toEqual({
        deliveryId: scheduleRequest.deliveryId,
        status: "delivered",
        attemptCount: 4,
        nextAttemptAt: null,
      });

      const deliveredRow = await fetchWebhookDelivery(
        database.connectionString,
        scheduleRequest.deliveryId,
      );
      const recoveredEndpoint = await fetchWebhookEndpoint(database.connectionString);

      expect(deliveredRow).toMatchObject({
        state: "delivered",
        attemptCount: 4,
        deliveredAt: expect.any(Date),
        lastResponseStatus: 204,
        lastErrorCode: null,
        lastErrorRetryable: null,
      });
      expect(recoveredEndpoint).toMatchObject({
        deliveryState: "healthy",
        consecutiveDeliveryFailures: 0,
        lastErrorCode: null,
        lastErrorRetryable: null,
      });
      expect(scheduledDeliveryRequests).toEqual([
        scheduleRequest,
        {
          deliveryId: scheduleRequest.deliveryId,
          notBefore: firstAttempt.nextAttemptAt!,
        },
        {
          deliveryId: scheduleRequest.deliveryId,
          notBefore: secondAttempt.nextAttemptAt!,
        },
        {
          deliveryId: scheduleRequest.deliveryId,
          notBefore: thirdAttempt.nextAttemptAt!,
        },
      ]);
    });
  }, 15_000);

  it("ignores stale completion attempts after the delivery is reclaimed", async () => {
    await withIsolatedDatabase(async (database) => {
      await seedWebhookDeliveryFixture(database.connectionString);

      const [{ deliveryId, notBefore }] = await scheduleDurableWebhookDeliveries(
        database.connectionString,
        [],
      );
      const { reclaimedAttemptApplied, staleAttemptApplied } = await Effect.runPromise(
        Effect.gen(function* () {
          const webhookDeliveryStore = yield* WebhookDeliveryStore;
          const firstAttempt = yield* webhookDeliveryStore.prepareWebhookDeliveryAttempt(
            deliveryId,
            notBefore,
          );
          const preparedFirstAttempt = yield* Option.match(firstAttempt, {
            onNone: () => Effect.fail(new Error("Expected the first webhook attempt to claim.")),
            onSome: (delivery) => Effect.succeed(delivery),
          });
          const reclaimedAttempt = yield* webhookDeliveryStore.prepareWebhookDeliveryAttempt(
            deliveryId,
            addMillisecondsToIsoTimestamp(notBefore, 31_000),
          );
          const preparedReclaimedAttempt = yield* Option.match(reclaimedAttempt, {
            onNone: () =>
              Effect.fail(new Error("Expected the stale webhook attempt to be reclaimed.")),
            onSome: (delivery) => Effect.succeed(delivery),
          });
          const reclaimedCompletionApplied =
            yield* webhookDeliveryStore.completeWebhookDeliveryAttempt({
              deliveryId,
              attemptCount: preparedReclaimedAttempt.attemptCount,
              processingStartedAt: preparedReclaimedAttempt.processingStartedAt,
              state: "delivered",
              completedAt: addMillisecondsToIsoTimestamp(notBefore, 32_000),
              nextAttemptAt: null,
              responseStatusCode: 204,
              errorCode: null,
              errorMessage: null,
              retryable: null,
            });
          const staleCompletionApplied = yield* webhookDeliveryStore.completeWebhookDeliveryAttempt(
            {
              deliveryId,
              attemptCount: preparedFirstAttempt.attemptCount,
              processingStartedAt: preparedFirstAttempt.processingStartedAt,
              state: "failed",
              completedAt: addMillisecondsToIsoTimestamp(notBefore, 33_000),
              nextAttemptAt: null,
              responseStatusCode: 503,
              errorCode: "webhook_endpoint_http_503",
              errorMessage: "Webhook endpoint responded with HTTP 503.",
              retryable: true,
            },
          );

          return {
            reclaimedAttemptApplied: reclaimedCompletionApplied,
            staleAttemptApplied: staleCompletionApplied,
          };
        }).pipe(Effect.provide(createCorePersistenceLayer(database.connectionString))),
      );
      const delivery = await fetchWebhookDelivery(database.connectionString, deliveryId);
      const endpoint = await fetchWebhookEndpoint(database.connectionString);

      expect(reclaimedAttemptApplied).toBe(true);
      expect(staleAttemptApplied).toBe(false);
      expect(delivery).toMatchObject({
        id: deliveryId,
        state: "delivered",
        attemptCount: 2,
        lastResponseStatus: 204,
        lastErrorCode: null,
      });
      expect(endpoint).toMatchObject({
        deliveryState: "healthy",
        consecutiveDeliveryFailures: 0,
        lastErrorCode: null,
        lastErrorRetryable: null,
      });
    });
  });

  it("recovers pending and in-flight webhook deliveries from durable state on startup", async () => {
    await withIsolatedDatabase(async (database) => {
      await seedWebhookDeliveryFixture(database.connectionString);

      const [{ deliveryId }] = await scheduleDurableWebhookDeliveries(
        database.connectionString,
        [],
      );
      const firstAttempt = await executeWebhookDelivery(database.connectionString, deliveryId, [], {
        send: () =>
          Effect.succeed({
            statusCode: 503,
          }),
      });
      const recoveredPendingRequests: Array<{
        deliveryId: string;
        notBefore: string;
      }> = [];
      const pendingRecovery = await recoverDurableWebhookDeliveries(
        database.connectionString,
        addMillisecondsToIsoTimestamp(firstAttempt.nextAttemptAt!, -1_000),
        recoveredPendingRequests,
      );

      expect(pendingRecovery).toEqual([
        {
          deliveryId,
          notBefore: firstAttempt.nextAttemptAt!,
        },
      ]);
      expect(recoveredPendingRequests).toEqual(pendingRecovery);

      await resetWebhookDeliveryAvailability(
        database.connectionString,
        deliveryId,
        new Date(Date.now() - 1_000).toISOString(),
      );

      const processingAttempt = await Effect.runPromise(
        Effect.gen(function* () {
          const webhookDeliveryStore = yield* WebhookDeliveryStore;
          const claimedAttempt = yield* webhookDeliveryStore.prepareWebhookDeliveryAttempt(
            deliveryId,
            new Date().toISOString(),
          );

          return yield* Option.match(claimedAttempt, {
            onNone: () =>
              Effect.fail(new Error("Expected the delivery recovery claim to succeed.")),
            onSome: (delivery) => Effect.succeed(delivery),
          });
        }).pipe(Effect.provide(createCorePersistenceLayer(database.connectionString))),
      );
      const recoveredProcessingRequests: Array<{
        deliveryId: string;
        notBefore: string;
      }> = [];
      const processingRecoveryObservedAt = addMillisecondsToIsoTimestamp(
        processingAttempt.processingStartedAt,
        5_000,
      );
      const processingRecovery = await recoverDurableWebhookDeliveries(
        database.connectionString,
        processingRecoveryObservedAt,
        recoveredProcessingRequests,
      );

      expect(processingRecovery).toEqual([
        {
          deliveryId,
          notBefore: addMillisecondsToIsoTimestamp(processingAttempt.processingStartedAt, 30_000),
        },
      ]);
      expect(recoveredProcessingRequests).toEqual(processingRecovery);
    });
  });
});
