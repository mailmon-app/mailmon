import { describe, expect, it } from "@effect/vitest";
import {
  createWebhookEndpoint,
  createWebhookEndpointSubscription,
  getWebhookEndpointOrFail,
} from "@mailmon/core";
import { createAesGcmGmailRefreshTokenCipherLayer } from "@mailmon/gmail";
import { eq } from "drizzle-orm";
import { Cause, Effect, Exit, Layer, Option } from "effect";

import { createCorePersistenceLayer, createDb, schema } from "./index.js";
import { withIsolatedDatabaseEffect } from "./test-setup.js";

const primaryWorkspaceId = "ws_primary";
const foreignWorkspaceId = "ws_foreign";
const primaryMailboxId = "mbx_primary";
const foreignMailboxId = "mbx_foreign";
const testGmailRefreshTokenCipherLayer = createAesGcmGmailRefreshTokenCipherLayer({
  allowPlaintextFallback: true,
  encryptionKey: "BwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwc=",
});

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
  it.effect(
    "creates webhook endpoints, stores the secret durably, and omits it from read paths",
    () =>
      withIsolatedDatabaseEffect(({ connectionString }) => {
        const persistenceLayer = createCorePersistenceLayer(connectionString).pipe(
          Layer.provide(testGmailRefreshTokenCipherLayer),
        );

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
    withIsolatedDatabaseEffect(({ connectionString }) => {
      const persistenceLayer = createCorePersistenceLayer(connectionString).pipe(
        Layer.provide(testGmailRefreshTokenCipherLayer),
      );

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

  it.effect(
    "returns conflicts for duplicate endpoint urls and duplicate mailbox subscriptions",
    () =>
      withIsolatedDatabaseEffect(({ connectionString }) => {
        const persistenceLayer = createCorePersistenceLayer(connectionString).pipe(
          Layer.provide(testGmailRefreshTokenCipherLayer),
        );

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
    withIsolatedDatabaseEffect(({ connectionString }) => {
      const persistenceLayer = createCorePersistenceLayer(connectionString).pipe(
        Layer.provide(testGmailRefreshTokenCipherLayer),
      );

      return Effect.gen(function* () {
        yield* Effect.promise(() => seedWebhookFixtures(connectionString));

        const endpointResults = yield* Effect.all(
          [
            createWebhookEndpoint(primaryWorkspaceId, {
              url: "https://app.example.com/webhooks/concurrent",
              description: "first",
            }).pipe(Effect.exit),
            createWebhookEndpoint(primaryWorkspaceId, {
              url: "https://app.example.com/webhooks/concurrent",
              description: "second",
            }).pipe(Effect.exit),
          ],
          { concurrency: "unbounded" },
        );

        expect(endpointResults.filter(Exit.isSuccess)).toHaveLength(1);
        expect(
          endpointResults
            .filter(Exit.isFailure)
            .map((result) => Cause.findErrorOption(result.cause)),
        ).toEqual([
          Option.some(
            expect.objectContaining({
              code: "webhook_endpoint_already_exists",
              status: 409,
            }),
          ),
        ]);

        const primaryEndpoint = yield* createWebhookEndpoint(primaryWorkspaceId, {
          url: "https://app.example.com/webhooks/subscription-concurrent",
          description: "subscription concurrent",
        });
        const subscriptionResults = yield* Effect.all(
          [
            createWebhookEndpointSubscription(primaryWorkspaceId, primaryEndpoint.id, {
              mailboxIds: [primaryMailboxId],
              eventTypes: ["message.created"],
            }).pipe(Effect.exit),
            createWebhookEndpointSubscription(primaryWorkspaceId, primaryEndpoint.id, {
              mailboxIds: [primaryMailboxId],
              eventTypes: ["message.updated"],
            }).pipe(Effect.exit),
          ],
          { concurrency: "unbounded" },
        );

        expect(subscriptionResults.filter(Exit.isSuccess)).toHaveLength(1);
        expect(
          subscriptionResults
            .filter(Exit.isFailure)
            .map((result) => Cause.findErrorOption(result.cause)),
        ).toEqual([
          Option.some(
            expect.objectContaining({
              code: "webhook_endpoint_subscription_already_exists",
              status: 409,
            }),
          ),
        ]);
      }).pipe(Effect.provide(persistenceLayer));
    }),
  );
});
