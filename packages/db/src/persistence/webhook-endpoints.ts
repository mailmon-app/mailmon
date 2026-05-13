import {
  WebhookEndpointCatalog,
  WebhookEndpointStore,
  WebhookEndpointSubscriptionStore,
  webhookEndpointAlreadyExists,
  webhookEndpointSubscriptionAlreadyExists,
  type ListResource,
  type WebhookEndpointSubscriptionResource,
} from "@mailmon/core";
import { and, eq } from "drizzle-orm";
import { Effect, Layer, Option } from "effect";

import { webhookEndpointSubscriptions, webhookEndpoints } from "../schema.js";
import { toDate } from "./common-mappers.js";
import { MailmonDatabase } from "./database.js";
import { isProblemDetails } from "./problems.js";
import {
  toCreatedWebhookEndpointResource,
  toWebhookEndpointResource,
  toWebhookEndpointSubscriptionResource,
} from "./public-resource-mappers.js";

export const createWebhookEndpointCatalogLayer = Layer.effect(
  WebhookEndpointCatalog,
  Effect.gen(function* () {
    const database = yield* MailmonDatabase;

    return {
      getWebhookEndpoint: (
        webhookEndpointId: string,
        options: Readonly<{
          workspaceId?: string;
        }> = {},
      ) =>
        Effect.promise(async () => {
          const [row] = await database.db
            .select()
            .from(webhookEndpoints)
            .where(
              options.workspaceId === undefined
                ? eq(webhookEndpoints.id, webhookEndpointId)
                : and(
                    eq(webhookEndpoints.id, webhookEndpointId),
                    eq(webhookEndpoints.workspaceId, options.workspaceId),
                  ),
            )
            .limit(1);

          return Option.fromNullishOr(row).pipe(Option.map(toWebhookEndpointResource));
        }),
    };
  }),
);

export const createWebhookEndpointStoreLayer = Layer.effect(
  WebhookEndpointStore,
  Effect.gen(function* () {
    const database = yield* MailmonDatabase;

    return {
      createWebhookEndpoint: (params) =>
        Effect.tryPromise({
          catch: (error) => {
            if (isProblemDetails(error)) {
              return error;
            }

            throw error;
          },
          try: async () => {
            const [row] = await database.db
              .insert(webhookEndpoints)
              .values({
                id: params.id,
                workspaceId: params.workspaceId,
                url: params.url,
                description: params.description,
                signingSecret: params.secret,
                deliveryState: "healthy",
                createdAt: toDate(params.createdAt),
                updatedAt: toDate(params.createdAt),
              })
              .onConflictDoNothing({
                target: [webhookEndpoints.workspaceId, webhookEndpoints.url],
              })
              .returning();

            if (row === undefined) {
              throw webhookEndpointAlreadyExists(params.url);
            }

            return toCreatedWebhookEndpointResource(row);
          },
        }),
    };
  }),
);

export const createWebhookEndpointSubscriptionStoreLayer = Layer.effect(
  WebhookEndpointSubscriptionStore,
  Effect.gen(function* () {
    const database = yield* MailmonDatabase;

    return {
      createWebhookEndpointSubscription: (params) =>
        Effect.tryPromise({
          catch: (error) => {
            if (isProblemDetails(error)) {
              return error;
            }

            throw error;
          },
          try: async () => {
            return database.db.transaction(async (transaction) => {
              const createdAt = toDate(params.createdAt);
              const rows = await transaction
                .insert(webhookEndpointSubscriptions)
                .values(
                  params.mailboxIds.map((mailboxId) => ({
                    id: `whsub_${globalThis.crypto.randomUUID()}`,
                    workspaceId: params.workspaceId,
                    webhookEndpointId: params.webhookEndpointId,
                    mailboxId,
                    eventTypes: [...params.eventTypes],
                    createdAt,
                    updatedAt: createdAt,
                  })),
                )
                .onConflictDoNothing({
                  target: [
                    webhookEndpointSubscriptions.webhookEndpointId,
                    webhookEndpointSubscriptions.mailboxId,
                  ],
                })
                .returning();

              if (rows.length !== params.mailboxIds.length) {
                const insertedMailboxIds = new Set(rows.map((row) => row.mailboxId));
                const conflictingMailboxId = params.mailboxIds.find(
                  (mailboxId) => !insertedMailboxIds.has(mailboxId),
                );

                if (conflictingMailboxId === undefined) {
                  throw new Error(
                    `Webhook endpoint subscription insert count mismatch for ${params.webhookEndpointId}.`,
                  );
                }

                throw webhookEndpointSubscriptionAlreadyExists(
                  params.webhookEndpointId,
                  conflictingMailboxId,
                );
              }

              return {
                object: "list",
                data: rows.map((row) => toWebhookEndpointSubscriptionResource(row)),
                nextCursor: null,
              } satisfies ListResource<WebhookEndpointSubscriptionResource>;
            });
          },
        }),
    };
  }),
);
