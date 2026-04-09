import { randomUUID } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";

import { describe, expect, it } from "@effect/vitest";
import {
  createWebhookEndpoint,
  createWebhookEndpointSubscription,
  getWebhookEndpointOrFail,
} from "@mailmon/core";
import { eq } from "drizzle-orm";
import { Effect, Fiber } from "effect";
import postgres from "postgres";

import { createCorePersistenceLayer, createDb, schema } from "./index.js";

const DEFAULT_DATABASE_URL =
  process.env.DATABASE_URL ?? "postgres://mailmon:mailmon@localhost:5432/mailmon";
const primaryWorkspaceId = "ws_primary";
const foreignWorkspaceId = "ws_foreign";
const primaryMailboxId = "mbx_primary";
const foreignMailboxId = "mbx_foreign";
const migrationDirectory = new URL("../drizzle/", import.meta.url);

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

const readMigrationStatements = async () => {
  const entries = await readdir(migrationDirectory);
  const migrationFiles = entries.filter((entry) => entry.endsWith(".sql")).toSorted();

  const statements = await Promise.all(
    migrationFiles.map(async (migrationFile) => {
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

const withIsolatedDatabase = <A, E>(run: (database: IsolatedDatabase) => Effect.Effect<A, E>) =>
  Effect.acquireUseRelease(
    Effect.promise(() => createIsolatedDatabase()),
    run,
    (database) => Effect.promise(() => dropIsolatedDatabase(database)),
  );

const seedWebhookFixtures = async (connectionString: string) => {
  const database = createDb(connectionString);

  try {
    await database.db.insert(schema.workspaces).values([
      {
        id: primaryWorkspaceId,
      },
      {
        id: foreignWorkspaceId,
      },
    ]);

    await database.db.insert(schema.mailboxes).values([
      {
        id: primaryMailboxId,
        workspaceId: primaryWorkspaceId,
        provider: "gmail",
        emailAddress: "primary@mailmon.dev",
        status: "active",
        syncState: "healthy",
        watchState: "active",
      },
      {
        id: foreignMailboxId,
        workspaceId: foreignWorkspaceId,
        provider: "gmail",
        emailAddress: "foreign@mailmon.dev",
        status: "active",
        syncState: "healthy",
        watchState: "active",
      },
    ]);
  } finally {
    await database.client.end();
  }
};

const fetchStoredWebhookEndpoint = async (connectionString: string, webhookEndpointId: string) => {
  const database = createDb(connectionString);

  try {
    const [row] = await database.db
      .select({
        deliveryState: schema.webhookEndpoints.deliveryState,
        signingSecret: schema.webhookEndpoints.signingSecret,
      })
      .from(schema.webhookEndpoints)
      .where(eq(schema.webhookEndpoints.id, webhookEndpointId));

    return row;
  } finally {
    await database.client.end();
  }
};

describe("DB-backed webhook endpoint spine", () => {
  it.effect("creates webhook endpoints, stores the secret durably, and omits it from read paths", () =>
    withIsolatedDatabase(({ connectionString }) => {
      const persistenceLayer = createCorePersistenceLayer(connectionString);

      return Effect.gen(function* () {
        yield* Effect.promise(() => seedWebhookFixtures(connectionString));

        const createdWebhookEndpoint = yield* createWebhookEndpoint(primaryWorkspaceId, {
          url: "https://app.example.com/webhooks/mailmon",
          description: "production inbox events",
        });
        const readWebhookEndpoint = yield* getWebhookEndpointOrFail(createdWebhookEndpoint.id, {
          workspaceId: primaryWorkspaceId,
        });
        const storedWebhookEndpoint = yield* Effect.promise(() =>
          fetchStoredWebhookEndpoint(connectionString, createdWebhookEndpoint.id),
        );

        expect(createdWebhookEndpoint.id).toMatch(/^whe_/);
        expect(createdWebhookEndpoint.secret).toMatch(/^whsec_/);
        expect(readWebhookEndpoint).toEqual({
          id: createdWebhookEndpoint.id,
          object: "webhook_endpoint",
          url: "https://app.example.com/webhooks/mailmon",
          description: "production inbox events",
          deliveryState: "healthy",
          lastDeliveryAt: null,
          lastDeliveryError: null,
          createdAt: createdWebhookEndpoint.createdAt,
        });
        expect(Object.prototype.hasOwnProperty.call(readWebhookEndpoint, "secret")).toBe(false);
        expect(storedWebhookEndpoint).toEqual({
          deliveryState: "healthy",
          signingSecret: createdWebhookEndpoint.secret,
        });
      }).pipe(Effect.provide(persistenceLayer));
    }),
  );

  it.effect("collapses foreign-owned resources to not found in mailbox-scoped subscriptions", () =>
    withIsolatedDatabase(({ connectionString }) => {
      const persistenceLayer = createCorePersistenceLayer(connectionString);

      return Effect.gen(function* () {
        yield* Effect.promise(() => seedWebhookFixtures(connectionString));

        const primaryEndpoint = yield* createWebhookEndpoint(primaryWorkspaceId, {
          url: "https://app.example.com/webhooks/mailmon",
          description: "primary",
        });
        const foreignEndpoint = yield* createWebhookEndpoint(foreignWorkspaceId, {
          url: "https://foreign.example.com/webhooks/mailmon",
          description: "foreign",
        });
        const createdSubscriptions = yield* createWebhookEndpointSubscription(
          primaryWorkspaceId,
          primaryEndpoint.id,
          {
            mailboxIds: [primaryMailboxId],
            eventTypes: ["message.created", "thread.updated"],
          },
        );
        const foreignMailboxProblem = yield* createWebhookEndpointSubscription(
          primaryWorkspaceId,
          primaryEndpoint.id,
          {
            mailboxIds: [foreignMailboxId],
            eventTypes: ["message.created"],
          },
        ).pipe(Effect.flip);
        const foreignEndpointProblem = yield* createWebhookEndpointSubscription(
          primaryWorkspaceId,
          foreignEndpoint.id,
          {
            mailboxIds: [primaryMailboxId],
            eventTypes: ["message.created"],
          },
        ).pipe(Effect.flip);

        expect(createdSubscriptions.data).toEqual([
          {
            id: expect.stringMatching(/^whsub_/),
            object: "webhook_endpoint_subscription",
            webhookEndpointId: primaryEndpoint.id,
            mailboxId: primaryMailboxId,
            eventTypes: ["message.created", "thread.updated"],
            createdAt: expect.any(String),
          },
        ]);
        expect(foreignMailboxProblem.code).toBe("mailbox_not_found");
        expect(foreignMailboxProblem.status).toBe(404);
        expect(foreignEndpointProblem.code).toBe("webhook_endpoint_not_found");
        expect(foreignEndpointProblem.status).toBe(404);
      }).pipe(Effect.provide(persistenceLayer));
    }),
  );

  it.effect("returns conflicts for duplicate endpoint urls and duplicate mailbox subscriptions", () =>
    withIsolatedDatabase(({ connectionString }) => {
      const persistenceLayer = createCorePersistenceLayer(connectionString);

      return Effect.gen(function* () {
        yield* Effect.promise(() => seedWebhookFixtures(connectionString));

        const primaryEndpoint = yield* createWebhookEndpoint(primaryWorkspaceId, {
          url: "https://app.example.com/webhooks/mailmon",
          description: "primary",
        });
        const duplicateEndpointProblem = yield* createWebhookEndpoint(primaryWorkspaceId, {
          url: "https://app.example.com/webhooks/mailmon",
          description: "duplicate primary",
        }).pipe(Effect.flip);
        const foreignWorkspaceEndpoint = yield* createWebhookEndpoint(foreignWorkspaceId, {
          url: "https://app.example.com/webhooks/mailmon",
          description: "foreign",
        });

        yield* createWebhookEndpointSubscription(primaryWorkspaceId, primaryEndpoint.id, {
          mailboxIds: [primaryMailboxId],
          eventTypes: ["message.created"],
        });
        const duplicateSubscriptionProblem = yield* createWebhookEndpointSubscription(
          primaryWorkspaceId,
          primaryEndpoint.id,
          {
            mailboxIds: [primaryMailboxId],
            eventTypes: ["message.updated"],
          },
        ).pipe(Effect.flip);

        expect(duplicateEndpointProblem.code).toBe("webhook_endpoint_already_exists");
        expect(duplicateEndpointProblem.status).toBe(409);
        expect(foreignWorkspaceEndpoint.id).toMatch(/^whe_/);
        expect(duplicateSubscriptionProblem.code).toBe(
          "webhook_endpoint_subscription_already_exists",
        );
        expect(duplicateSubscriptionProblem.status).toBe(409);
      }).pipe(Effect.provide(persistenceLayer));
    }),
  );

  it.effect("maps concurrent duplicate endpoint and subscription creates to 409 problems", () =>
    withIsolatedDatabase(({ connectionString }) => {
      const persistenceLayer = createCorePersistenceLayer(connectionString);

      return Effect.gen(function* () {
        yield* Effect.promise(() => seedWebhookFixtures(connectionString));

        const endpointCreateA = yield* Effect.fork(
          createWebhookEndpoint(primaryWorkspaceId, {
            url: "https://app.example.com/webhooks/concurrent",
            description: "first",
          }).pipe(Effect.either),
        );
        const endpointCreateB = yield* Effect.fork(
          createWebhookEndpoint(primaryWorkspaceId, {
            url: "https://app.example.com/webhooks/concurrent",
            description: "second",
          }).pipe(Effect.either),
        );
        const endpointResults = [
          yield* Fiber.join(endpointCreateA),
          yield* Fiber.join(endpointCreateB),
        ];

        expect(endpointResults.filter((result) => result._tag === "Right")).toHaveLength(1);
        expect(endpointResults.filter((result) => result._tag === "Left")).toEqual([
          expect.objectContaining({
            _tag: "Left",
            left: expect.objectContaining({
              code: "webhook_endpoint_already_exists",
              status: 409,
            }),
          }),
        ]);

        const primaryEndpoint = yield* createWebhookEndpoint(primaryWorkspaceId, {
          url: "https://app.example.com/webhooks/subscription-concurrent",
          description: "subscription concurrent",
        });
        const subscriptionCreateA = yield* Effect.fork(
          createWebhookEndpointSubscription(primaryWorkspaceId, primaryEndpoint.id, {
            mailboxIds: [primaryMailboxId],
            eventTypes: ["message.created"],
          }).pipe(Effect.either),
        );
        const subscriptionCreateB = yield* Effect.fork(
          createWebhookEndpointSubscription(primaryWorkspaceId, primaryEndpoint.id, {
            mailboxIds: [primaryMailboxId],
            eventTypes: ["message.updated"],
          }).pipe(Effect.either),
        );
        const subscriptionResults = [
          yield* Fiber.join(subscriptionCreateA),
          yield* Fiber.join(subscriptionCreateB),
        ];

        expect(subscriptionResults.filter((result) => result._tag === "Right")).toHaveLength(1);
        expect(subscriptionResults.filter((result) => result._tag === "Left")).toEqual([
          expect.objectContaining({
            _tag: "Left",
            left: expect.objectContaining({
              code: "webhook_endpoint_subscription_already_exists",
              status: 409,
            }),
          }),
        ]);
      }).pipe(Effect.provide(persistenceLayer));
    }),
  );
});
