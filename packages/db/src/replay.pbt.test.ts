import { describe, expect, it } from "@effect/vitest";
import * as hegel from "@hegeldev/hegel";
import * as gs from "@hegeldev/hegel/generators";
import {
  createReplay,
  dispatchReplays,
  getReplayOrFail,
  type MailboxEventEnvelope,
  type ProblemDetails,
  type ReplayStatus,
  WebhookDeliveryScheduler,
  type WebhookDeliveryScheduleRequest,
} from "@mailmon/core";
import { createAesGcmGmailRefreshTokenCipherLayer } from "@mailmon/gmail";
import { asc, eq, inArray } from "drizzle-orm";
import { Cause, Effect, Exit, Layer, Option } from "effect";

import { createCorePersistenceLayer, createDb, schema } from "./index.js";
import { hegelSettings, notePbtCase } from "./test-hegel.js";
import { withIsolatedDatabasePromise } from "./test-setup.js";

const primaryWorkspaceId = "ws_replay_pbt";
const alternateWorkspaceId = "ws_replay_pbt_alt";
const primaryMailboxId = "mbx_replay_pbt";
const alternateMailboxId = "mbx_replay_pbt_alt";
const primaryWebhookEndpointId = "whe_replay_pbt";
const alternateWebhookEndpointId = "whe_replay_pbt_alt";
const tenantExternalId = "tenant_replay_pbt";

const testGmailRefreshTokenCipherLayer = createAesGcmGmailRefreshTokenCipherLayer({
  allowPlaintextFallback: true,
  encryptionKey: "BwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwc=",
});

type InactiveReplayStatus = "cancelled" | "completed" | "failed" | "none";
type IdentityFamily = "different-endpoint" | "different-mailbox" | "different-workspace" | "same";
type RangeFamily =
  | "disjoint-after"
  | "disjoint-before"
  | "identical"
  | "nested"
  | "partial-overlap"
  | "touching-boundary";
type DispatchRangeFamily =
  | "all"
  | "empty-after"
  | "empty-before"
  | "middle-window"
  | "single-boundary"
  | "tail-window";

const inactiveReplayStatusGen = gs.sampledFrom([
  "none",
  "completed",
  "failed",
  "cancelled",
] as const satisfies ReadonlyArray<InactiveReplayStatus>);
const identityFamilyGen = gs.sampledFrom([
  "same",
  "different-mailbox",
  "different-endpoint",
  "different-workspace",
] as const satisfies ReadonlyArray<IdentityFamily>);
const rangeFamilyGen = gs.sampledFrom([
  "identical",
  "nested",
  "partial-overlap",
  "touching-boundary",
  "disjoint-before",
  "disjoint-after",
] as const satisfies ReadonlyArray<RangeFamily>);
const dispatchRangeFamilyGen = gs.sampledFrom([
  "empty-before",
  "empty-after",
  "all",
  "single-boundary",
  "middle-window",
  "tail-window",
] as const satisfies ReadonlyArray<DispatchRangeFamily>);

const eventDefinitions = [
  { index: 1, id: "evt_replay_pbt_a", occurredAt: "2026-04-10T10:00:00.000Z" },
  { index: 0, id: "evt_replay_pbt_d", occurredAt: "2026-04-10T10:00:00.000Z" },
  { index: 2, id: "evt_replay_pbt_f", occurredAt: "2026-04-10T10:05:00.000Z" },
  { index: 3, id: "evt_replay_pbt_b", occurredAt: "2026-04-10T10:10:00.000Z" },
  { index: 4, id: "evt_replay_pbt_e", occurredAt: "2026-04-10T10:10:00.000Z" },
  { index: 5, id: "evt_replay_pbt_c", occurredAt: "2026-04-10T10:20:00.000Z" },
] as const;
const eventDefinitionIndexes = [0, 1, 2, 3, 4, 5] as const;
const eventDefinitionByIndex: ReadonlyMap<number, (typeof eventDefinitions)[number]> = new Map(
  eventDefinitions.map((event) => [event.index, event] as const),
);

type ReplayRange = Readonly<{
  endTime: string;
  startTime: string;
}>;

const runtimeLayer = (
  connectionString: string,
  scheduledDeliveryRequests: Array<WebhookDeliveryScheduleRequest> = [],
) =>
  Layer.mergeAll(
    createCorePersistenceLayer(connectionString).pipe(
      Layer.provide(testGmailRefreshTokenCipherLayer),
    ),
    Layer.succeed(WebhookDeliveryScheduler, {
      scheduleWebhookDelivery: (request) =>
        Effect.sync(() => {
          scheduledDeliveryRequests.push(request);
        }),
    }),
  );

const buildMailboxEventEnvelope = (eventId: string, occurredAt: string): MailboxEventEnvelope => ({
  id: eventId,
  type: "message.created",
  occurredAt,
  workspaceId: primaryWorkspaceId,
  tenantExternalId,
  mailboxId: primaryMailboxId,
  schemaVersion: 1,
  data: {
    messageId: `msg_${eventId}`,
    threadId: `thr_${eventId}`,
    providerMessageId: `gmail_msg_${eventId}`,
    providerThreadId: `gmail_thr_${eventId}`,
    subject: `Replay PBT ${eventId}`,
    snippet: `Generated replay PBT event ${eventId}`,
    receivedAt: occurredAt,
    labelIds: ["INBOX"],
  },
});

const rangesForFamily = (
  family: RangeFamily,
): Readonly<{ first: ReplayRange; second: ReplayRange }> => {
  const first = {
    startTime: "2026-04-10T10:00:00.000Z",
    endTime: "2026-04-10T10:30:00.000Z",
  };

  switch (family) {
    case "identical":
      return { first, second: first };
    case "nested":
      return {
        first,
        second: {
          startTime: "2026-04-10T10:10:00.000Z",
          endTime: "2026-04-10T10:20:00.000Z",
        },
      };
    case "partial-overlap":
      return {
        first,
        second: {
          startTime: "2026-04-10T10:20:00.000Z",
          endTime: "2026-04-10T10:45:00.000Z",
        },
      };
    case "touching-boundary":
      return {
        first: {
          startTime: "2026-04-10T10:00:00.000Z",
          endTime: "2026-04-10T10:15:00.000Z",
        },
        second: {
          startTime: "2026-04-10T10:15:00.000Z",
          endTime: "2026-04-10T10:30:00.000Z",
        },
      };
    case "disjoint-before":
      return {
        first: {
          startTime: "2026-04-10T10:00:00.000Z",
          endTime: "2026-04-10T10:10:00.000Z",
        },
        second: {
          startTime: "2026-04-10T10:11:00.000Z",
          endTime: "2026-04-10T10:30:00.000Z",
        },
      };
    case "disjoint-after":
      return {
        first: {
          startTime: "2026-04-10T10:20:00.000Z",
          endTime: "2026-04-10T10:30:00.000Z",
        },
        second: {
          startTime: "2026-04-10T10:00:00.000Z",
          endTime: "2026-04-10T10:19:00.000Z",
        },
      };
  }

  const exhaustive: never = family;
  void exhaustive;
  throw new Error("Unsupported replay range family.");
};

const dispatchRangeForFamily = (family: DispatchRangeFamily): ReplayRange => {
  switch (family) {
    case "empty-before":
      return {
        startTime: "2026-04-10T09:00:00.000Z",
        endTime: "2026-04-10T09:30:00.000Z",
      };
    case "empty-after":
      return {
        startTime: "2026-04-10T11:00:00.000Z",
        endTime: "2026-04-10T11:30:00.000Z",
      };
    case "all":
      return {
        startTime: "2026-04-10T09:59:00.000Z",
        endTime: "2026-04-10T10:21:00.000Z",
      };
    case "single-boundary":
      return {
        startTime: "2026-04-10T10:00:00.000Z",
        endTime: "2026-04-10T10:00:00.000Z",
      };
    case "middle-window":
      return {
        startTime: "2026-04-10T10:05:00.000Z",
        endTime: "2026-04-10T10:10:00.000Z",
      };
    case "tail-window":
      return {
        startTime: "2026-04-10T10:10:00.000Z",
        endTime: "2026-04-10T10:20:00.000Z",
      };
  }

  const exhaustive: never = family;
  void exhaustive;
  throw new Error("Unsupported dispatch range family.");
};

const rangesOverlap = (
  left: Readonly<{ endTime: Date | string; startTime: Date | string }>,
  right: Readonly<{ endTime: Date | string; startTime: Date | string }>,
) =>
  (left.startTime instanceof Date ? left.startTime.getTime() : Date.parse(left.startTime)) <=
    (right.endTime instanceof Date ? right.endTime.getTime() : Date.parse(right.endTime)) &&
  (left.endTime instanceof Date ? left.endTime.getTime() : Date.parse(left.endTime)) >=
    (right.startTime instanceof Date ? right.startTime.getTime() : Date.parse(right.startTime));

const expectedSelectedEventIds = (eventIndexes: ReadonlyArray<number>, range: ReplayRange) =>
  eventDefinitions
    .filter((event) => eventIndexes.includes(event.index))
    .filter((event) =>
      rangesOverlap({ startTime: event.occurredAt, endTime: event.occurredAt }, range),
    )
    .map((event) => event.id);

const seedReplayIdentities = async (connectionString: string) => {
  const database = createDb(connectionString);

  try {
    await database.db
      .insert(schema.workspaces)
      .values([{ id: primaryWorkspaceId }, { id: alternateWorkspaceId }]);

    await database.db.insert(schema.mailboxes).values([
      {
        id: primaryMailboxId,
        workspaceId: primaryWorkspaceId,
        provider: "gmail",
        tenantExternalId,
        mailboxExternalId: "mailbox_replay_pbt",
        emailAddress: "replay-pbt@mailmon.dev",
        status: "active",
        syncState: "healthy",
        watchState: "active",
      },
      {
        id: alternateMailboxId,
        workspaceId: primaryWorkspaceId,
        provider: "gmail",
        tenantExternalId,
        mailboxExternalId: "mailbox_replay_pbt_alt",
        emailAddress: "replay-pbt-alt@mailmon.dev",
        status: "active",
        syncState: "healthy",
        watchState: "active",
      },
      {
        id: `${alternateMailboxId}_workspace`,
        workspaceId: alternateWorkspaceId,
        provider: "gmail",
        tenantExternalId,
        mailboxExternalId: "mailbox_replay_pbt_other_workspace",
        emailAddress: "replay-pbt-other-workspace@mailmon.dev",
        status: "active",
        syncState: "healthy",
        watchState: "active",
      },
    ]);

    await database.db.insert(schema.webhookEndpoints).values([
      {
        id: primaryWebhookEndpointId,
        workspaceId: primaryWorkspaceId,
        url: "https://app.example.com/webhooks/replay-pbt",
        description: "replay pbt",
        signingSecret: "whsec_replay_pbt",
        deliveryState: "healthy",
      },
      {
        id: alternateWebhookEndpointId,
        workspaceId: primaryWorkspaceId,
        url: "https://app.example.com/webhooks/replay-pbt-alt",
        description: "replay pbt alt",
        signingSecret: "whsec_replay_pbt_alt",
        deliveryState: "healthy",
      },
      {
        id: `${alternateWebhookEndpointId}_workspace`,
        workspaceId: alternateWorkspaceId,
        url: "https://app.example.com/webhooks/replay-pbt-other-workspace",
        description: "replay pbt other workspace",
        signingSecret: "whsec_replay_pbt_other_workspace",
        deliveryState: "healthy",
      },
    ]);
  } finally {
    await database.client.end();
  }
};

const seedInactiveReplay = async (
  connectionString: string,
  status: Exclude<ReplayStatus, "queued" | "running"> | "none",
) => {
  if (status === "none") {
    return;
  }

  const database = createDb(connectionString);

  try {
    await database.db.insert(schema.replays).values({
      id: `rpl_replay_pbt_inactive_${status}`,
      workspaceId: primaryWorkspaceId,
      mailboxId: primaryMailboxId,
      webhookEndpointId: primaryWebhookEndpointId,
      status,
      startTime: new Date("2026-04-10T10:05:00.000Z"),
      endTime: new Date("2026-04-10T10:25:00.000Z"),
      eventsReplayed: status === "completed" ? 0 : null,
      lastError: status === "failed" ? "generated inactive replay failure" : null,
      startedAt: new Date("2026-04-10T10:04:00.000Z"),
      completedAt: new Date("2026-04-10T10:26:00.000Z"),
      createdAt: new Date("2026-04-10T10:03:00.000Z"),
      updatedAt: new Date("2026-04-10T10:26:00.000Z"),
    });
  } finally {
    await database.client.end();
  }
};

const seedDispatchFixture = async (
  connectionString: string,
  eventIndexes: ReadonlyArray<number>,
) => {
  const database = createDb(connectionString);

  try {
    await database.db.insert(schema.workspaces).values({
      id: primaryWorkspaceId,
    });

    await database.db.insert(schema.mailboxes).values({
      id: primaryMailboxId,
      workspaceId: primaryWorkspaceId,
      provider: "gmail",
      tenantExternalId,
      mailboxExternalId: "mailbox_replay_dispatch_pbt",
      emailAddress: "replay-dispatch-pbt@mailmon.dev",
      status: "active",
      syncState: "healthy",
      watchState: "active",
    });

    await database.db.insert(schema.webhookEndpoints).values({
      id: primaryWebhookEndpointId,
      workspaceId: primaryWorkspaceId,
      url: "https://app.example.com/webhooks/replay-dispatch-pbt",
      description: "replay dispatch pbt",
      signingSecret: "whsec_replay_dispatch_pbt",
      deliveryState: "healthy",
    });

    const events = eventIndexes
      .map((eventIndex) => eventDefinitionByIndex.get(eventIndex))
      .filter((event) => event !== undefined);

    if (events.length > 0) {
      await database.db.insert(schema.mailboxEvents).values(
        events.map((event) => ({
          id: event.id,
          mailboxId: primaryMailboxId,
          eventType: "message.created" as const,
          occurredAt: new Date(event.occurredAt),
          payload: buildMailboxEventEnvelope(event.id, event.occurredAt),
        })),
      );
    }
  } finally {
    await database.client.end();
  }
};

const fetchActiveReplays = async (connectionString: string) => {
  const database = createDb(connectionString);

  try {
    return await database.db
      .select({
        endTime: schema.replays.endTime,
        id: schema.replays.id,
        mailboxId: schema.replays.mailboxId,
        startTime: schema.replays.startTime,
        status: schema.replays.status,
        webhookEndpointId: schema.replays.webhookEndpointId,
        workspaceId: schema.replays.workspaceId,
      })
      .from(schema.replays)
      .where(inArray(schema.replays.status, ["queued", "running"]))
      .orderBy(
        asc(schema.replays.workspaceId),
        asc(schema.replays.mailboxId),
        asc(schema.replays.id),
      );
  } finally {
    await database.client.end();
  }
};

const fetchReplayRow = async (connectionString: string, replayId: string) => {
  const database = createDb(connectionString);

  try {
    const [replay] = await database.db
      .select()
      .from(schema.replays)
      .where(eq(schema.replays.id, replayId))
      .limit(1);

    return replay;
  } finally {
    await database.client.end();
  }
};

const fetchWebhookDeliveries = async (connectionString: string) => {
  const database = createDb(connectionString);

  try {
    return await database.db
      .select()
      .from(schema.webhookDeliveries)
      .orderBy(asc(schema.webhookDeliveries.mailboxEventId), asc(schema.webhookDeliveries.id));
  } finally {
    await database.client.end();
  }
};

const assertActiveRangesDoNotOverlap = async (connectionString: string) => {
  const activeReplays = await fetchActiveReplays(connectionString);

  for (let leftIndex = 0; leftIndex < activeReplays.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < activeReplays.length; rightIndex += 1) {
      const left = activeReplays[leftIndex];
      const right = activeReplays[rightIndex];

      if (left === undefined || right === undefined) {
        continue;
      }

      const sameIdentity =
        left.workspaceId === right.workspaceId &&
        left.mailboxId === right.mailboxId &&
        left.webhookEndpointId === right.webhookEndpointId;

      if (sameIdentity) {
        expect(rangesOverlap(left, right)).toBe(false);
      }
    }
  }
};

const createReplayExit = (
  connectionString: string,
  workspaceId: string,
  request: ReplayRange & {
    readonly mailboxId: string;
    readonly webhookEndpointId: string;
  },
) =>
  Effect.runPromise(
    createReplay(workspaceId, request).pipe(
      Effect.exit,
      Effect.provide(runtimeLayer(connectionString)),
    ),
  );

const replayErrorsFromExits = (exits: ReadonlyArray<Exit.Exit<unknown, ProblemDetails>>) =>
  exits.flatMap((exit) => {
    if (Exit.isSuccess(exit)) {
      return [];
    }

    return Option.match(Cause.findErrorOption(exit.cause), {
      onNone: () => [],
      onSome: (error) => [error],
    });
  });

describe("DB-backed replay properties", () => {
  it(
    "replay-active-ranges-do-not-overlap keeps generated active Replay ranges pairwise non-overlapping",
    () =>
      hegel.testAsync(async (tc) => {
        const rangeFamily = tc.draw(rangeFamilyGen);
        const identityFamily = tc.draw(identityFamilyGen);
        const inactiveStatus = tc.draw(inactiveReplayStatusGen);
        const ranges = rangesForFamily(rangeFamily);
        const secondIdentity =
          identityFamily === "same"
            ? {
                mailboxId: primaryMailboxId,
                webhookEndpointId: primaryWebhookEndpointId,
                workspaceId: primaryWorkspaceId,
              }
            : identityFamily === "different-mailbox"
              ? {
                  mailboxId: alternateMailboxId,
                  webhookEndpointId: primaryWebhookEndpointId,
                  workspaceId: primaryWorkspaceId,
                }
              : identityFamily === "different-endpoint"
                ? {
                    mailboxId: primaryMailboxId,
                    webhookEndpointId: alternateWebhookEndpointId,
                    workspaceId: primaryWorkspaceId,
                  }
                : {
                    mailboxId: `${alternateMailboxId}_workspace`,
                    webhookEndpointId: `${alternateWebhookEndpointId}_workspace`,
                    workspaceId: alternateWorkspaceId,
                  };
        const expectedConflict =
          identityFamily === "same" && rangesOverlap(ranges.first, ranges.second);

        notePbtCase(tc, "replay-active-ranges-do-not-overlap", {
          family: "db-concurrent-create-active-ranges",
          expectedConflict,
          identityFamily,
          inactiveStatus,
          rangeFamily,
          ranges,
        });

        await withIsolatedDatabasePromise(async ({ connectionString }) => {
          await seedReplayIdentities(connectionString);
          await seedInactiveReplay(connectionString, inactiveStatus);

          const attempts = await Promise.all([
            createReplayExit(connectionString, primaryWorkspaceId, {
              mailboxId: primaryMailboxId,
              webhookEndpointId: primaryWebhookEndpointId,
              ...ranges.first,
            }),
            createReplayExit(connectionString, secondIdentity.workspaceId, {
              mailboxId: secondIdentity.mailboxId,
              webhookEndpointId: secondIdentity.webhookEndpointId,
              ...ranges.second,
            }),
          ]);

          const successes = attempts.filter(Exit.isSuccess);
          const replayErrors = replayErrorsFromExits(attempts);

          if (expectedConflict) {
            expect(successes).toHaveLength(1);
            expect(replayErrors).toHaveLength(1);
            expect(replayErrors[0]).toMatchObject({
              code: "replay_conflict",
              status: 409,
            });
          } else {
            expect(successes).toHaveLength(2);
            expect(replayErrors).toEqual([]);
          }

          await assertActiveRangesDoNotOverlap(connectionString);
        });
      }, hegelSettings),
    120_000,
  );

  it(
    "replay-dispatch-is-single-claim-and-counted dispatches generated Replay events once with durable counts",
    () =>
      hegel.testAsync(async (tc) => {
        const eventIndexes = tc.draw(
          gs.arrays(gs.sampledFrom(eventDefinitionIndexes), {
            maxSize: eventDefinitions.length,
            unique: true,
          }),
        );
        const rangeFamily = tc.draw(dispatchRangeFamilyGen);
        const dispatchCount = tc.draw(gs.integers({ minValue: 2, maxValue: 6 }));
        const range = dispatchRangeForFamily(rangeFamily);
        const expectedEventIds = expectedSelectedEventIds(eventIndexes, range);

        notePbtCase(tc, "replay-dispatch-is-single-claim-and-counted", {
          family: "db-concurrent-dispatch-claim-and-count",
          dispatchCount,
          eventIndexes,
          expectedEventIds,
          range,
          rangeFamily,
        });

        await withIsolatedDatabasePromise(async ({ connectionString }) => {
          const scheduledDeliveryRequests: Array<WebhookDeliveryScheduleRequest> = [];
          const layer = runtimeLayer(connectionString, scheduledDeliveryRequests);

          await seedDispatchFixture(connectionString, eventIndexes);

          const replay = await Effect.runPromise(
            createReplay(primaryWorkspaceId, {
              mailboxId: primaryMailboxId,
              webhookEndpointId: primaryWebhookEndpointId,
              ...range,
            }).pipe(Effect.provide(layer)),
          );
          const dispatchResults = await Promise.all(
            Array.from({ length: dispatchCount }, () =>
              Effect.runPromise(
                dispatchReplays({ observedAt: "2026-04-10T10:45:00.000Z" }).pipe(
                  Effect.provide(layer),
                ),
              ),
            ),
          );
          const completedReplay = await Effect.runPromise(
            getReplayOrFail(replay.id, { workspaceId: primaryWorkspaceId }).pipe(
              Effect.provide(layer),
            ),
          );
          const durableReplay = await fetchReplayRow(connectionString, replay.id);
          const deliveries = await fetchWebhookDeliveries(connectionString);
          const eventIdByDeliveryId = new Map(
            deliveries.map((delivery) => [delivery.id, delivery.mailboxEventId]),
          );
          const scheduledEventIds = scheduledDeliveryRequests.map(
            (request) => eventIdByDeliveryId.get(request.deliveryId) ?? request.deliveryId,
          );

          expect(dispatchResults.reduce((total, result) => total + result.dispatched, 0)).toBe(1);
          expect(dispatchResults.reduce((total, result) => total + result.failed, 0)).toBe(0);
          expect(dispatchResults.reduce((total, result) => total + result.eventsReplayed, 0)).toBe(
            expectedEventIds.length,
          );
          expect(completedReplay.status).toBe("completed");
          expect(completedReplay.eventsReplayed).toBe(expectedEventIds.length);
          expect(completedReplay.startedAt).toBe("2026-04-10T10:45:00.000Z");
          expect(completedReplay.completedAt).toBe("2026-04-10T10:45:00.000Z");
          expect(durableReplay?.status).toBe("completed");
          expect(durableReplay?.eventsReplayed).toBe(expectedEventIds.length);
          expect(deliveries).toHaveLength(expectedEventIds.length);
          expect(new Set(deliveries.map((delivery) => delivery.mailboxEventId))).toEqual(
            new Set(expectedEventIds),
          );
          expect(scheduledEventIds).toEqual(expectedEventIds);
          expect(
            deliveries.every(
              (delivery) =>
                delivery.webhookEndpointId === primaryWebhookEndpointId &&
                delivery.state === "pending" &&
                delivery.attemptCount === 0,
            ),
          ).toBe(true);
        });
      }, hegelSettings),
    120_000,
  );
});
