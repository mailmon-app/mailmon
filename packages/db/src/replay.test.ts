import {
  createReplay,
  dispatchReplays,
  getReplayOrFail,
  type MailboxEventEnvelope,
  WebhookDeliveryScheduler,
} from "@mailmon/core";
import { createAesGcmGmailRefreshTokenCipherLayer } from "@mailmon/gmail";
import { asc, eq } from "drizzle-orm";
import { Cause, Effect, Exit, Layer, Option } from "effect";
import postgres from "postgres";
import { describe, expect, it } from "vitest";

import { createCorePersistenceLayer, createDb, schema } from "./index.js";
import { withIsolatedDatabasePromise } from "./test-setup.js";

const workspaceId = "ws_replay";
const foreignWorkspaceId = "ws_replay_foreign";
const mailboxId = "mbx_replay";
const webhookEndpointId = "whe_replay";
const replayStartTime = "2026-04-10T10:00:00.000Z";
const replayEndTime = "2026-04-10T10:30:00.000Z";
const testGmailRefreshTokenCipherLayer = createAesGcmGmailRefreshTokenCipherLayer({
  allowPlaintextFallback: true,
  encryptionKey: "BwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwc=",
});

const mailboxEventFixture = (id: string, occurredAt: string): MailboxEventEnvelope => ({
  id,
  type: "message.created",
  occurredAt,
  workspaceId,
  tenantExternalId: "tenant_replay",
  mailboxId,
  schemaVersion: 1,
  data: {
    messageId: `msg_${id}`,
    threadId: `thr_${id}`,
    providerMessageId: `gmail_msg_${id}`,
    providerThreadId: `gmail_thr_${id}`,
    subject: `Replay fixture ${id}`,
    snippet: `Replay fixture ${id}`,
    receivedAt: occurredAt,
    labelIds: ["INBOX"],
  },
});

const seedReplayFixture = async (connectionString: string) => {
  const database = createDb(connectionString);

  try {
    await database.db
      .insert(schema.workspaces)
      .values([{ id: workspaceId }, { id: foreignWorkspaceId }]);

    await database.db.insert(schema.mailboxes).values({
      id: mailboxId,
      workspaceId,
      provider: "gmail",
      tenantExternalId: "tenant_replay",
      mailboxExternalId: "mailbox_replay",
      emailAddress: "replay@mailmon.dev",
      status: "active",
      syncState: "healthy",
      watchState: "active",
    });

    await database.db.insert(schema.webhookEndpoints).values({
      id: webhookEndpointId,
      workspaceId,
      url: "https://app.example.com/webhooks/replay",
      description: "replay fixture",
      signingSecret: "whsec_replay_fixture",
      deliveryState: "healthy",
    });

    const events = [
      mailboxEventFixture("evt_before_replay", "2026-04-10T09:59:59.000Z"),
      mailboxEventFixture("evt_replay_1", "2026-04-10T10:00:00.000Z"),
      mailboxEventFixture("evt_replay_2", "2026-04-10T10:15:00.000Z"),
      mailboxEventFixture("evt_after_replay", "2026-04-10T10:30:01.000Z"),
    ];

    await database.db.insert(schema.mailboxEvents).values(
      events.map((event) => ({
        id: event.id,
        mailboxId,
        eventType: event.type,
        occurredAt: new Date(event.occurredAt),
        payload: event,
      })),
    );
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
      .orderBy(asc(schema.webhookDeliveries.mailboxEventId));
  } finally {
    await database.client.end();
  }
};

const runtimeLayer = (connectionString: string) =>
  Layer.mergeAll(
    createCorePersistenceLayer(connectionString).pipe(
      Layer.provide(testGmailRefreshTokenCipherLayer),
    ),
    Layer.succeed(WebhookDeliveryScheduler, {
      scheduleWebhookDelivery: () => Effect.void,
    }),
  );

describe("Replay persistence", () => {
  it("creates, dispatches, and completes a Replay from mailbox events", async () => {
    await withIsolatedDatabasePromise(async ({ connectionString }) => {
      await seedReplayFixture(connectionString);

      const replay = await Effect.runPromise(
        createReplay(workspaceId, {
          mailboxId,
          webhookEndpointId,
          startTime: replayStartTime,
          endTime: replayEndTime,
        }).pipe(Effect.provide(runtimeLayer(connectionString))),
      );

      expect(replay.status).toBe("queued");

      const dispatchResult = await Effect.runPromise(
        dispatchReplays({ observedAt: "2026-04-10T10:31:00.000Z" }).pipe(
          Effect.provide(runtimeLayer(connectionString)),
        ),
      );

      expect(dispatchResult).toMatchObject({
        dispatched: 1,
        eventsReplayed: 2,
        failed: 0,
        scanned: 1,
        status: "completed",
      });

      const completedReplay = await Effect.runPromise(
        getReplayOrFail(replay.id, { workspaceId }).pipe(
          Effect.provide(runtimeLayer(connectionString)),
        ),
      );

      expect(completedReplay.status).toBe("completed");
      expect(completedReplay.eventsReplayed).toBe(2);
      expect(completedReplay.completedAt).toBe("2026-04-10T10:31:00.000Z");

      const deliveries = await fetchWebhookDeliveries(connectionString);
      expect(deliveries.map((delivery) => delivery.mailboxEventId)).toEqual([
        "evt_replay_1",
        "evt_replay_2",
      ]);
    });
  });

  it("rejects overlapping active Replays for the same mailbox and destination", async () => {
    await withIsolatedDatabasePromise(async ({ connectionString }) => {
      await seedReplayFixture(connectionString);

      await Effect.runPromise(
        createReplay(workspaceId, {
          mailboxId,
          webhookEndpointId,
          startTime: replayStartTime,
          endTime: replayEndTime,
        }).pipe(Effect.provide(runtimeLayer(connectionString))),
      );

      const conflict = await Effect.runPromise(
        createReplay(workspaceId, {
          mailboxId,
          webhookEndpointId,
          startTime: "2026-04-10T10:20:00.000Z",
          endTime: "2026-04-10T10:45:00.000Z",
        }).pipe(Effect.flip, Effect.provide(runtimeLayer(connectionString))),
      );

      expect(conflict.code).toBe("replay_conflict");
      expect(conflict.status).toBe(409);
    });
  });

  it("keeps overlapping active Replays single-flight under concurrent inserts", async () => {
    await withIsolatedDatabasePromise(async ({ connectionString }) => {
      await seedReplayFixture(connectionString);

      const clientA = postgres(connectionString, { max: 1 });
      const clientB = postgres(connectionString, { max: 1 });
      const inspect = postgres(connectionString, { max: 1 });

      let selected = 0;
      let releaseSelected!: () => void;
      let releaseInserts!: () => void;
      const bothSelected = new Promise<void>((resolve) => {
        releaseSelected = resolve;
      });
      const insertGate = new Promise<void>((resolve) => {
        releaseInserts = resolve;
      });

      const insertOverlappingReplay = (client: postgres.Sql, replayId: string) =>
        client.begin(async (transaction) => {
          const conflicts = await transaction<{ id: string }[]>`
            SELECT id
            FROM replays
            WHERE workspace_id = ${workspaceId}
              AND mailbox_id = ${mailboxId}
              AND webhook_endpoint_id = ${webhookEndpointId}
              AND status IN ('queued', 'running')
              AND start_time <= ${replayEndTime}
              AND end_time >= ${replayStartTime}
            ORDER BY created_at ASC, id ASC
            LIMIT 1
          `;
          expect(conflicts).toHaveLength(0);

          selected += 1;
          if (selected === 2) {
            releaseSelected();
          }

          await insertGate;

          await transaction`
            INSERT INTO replays (
              id, workspace_id, mailbox_id, webhook_endpoint_id, status,
              start_time, end_time, events_replayed, last_error, started_at,
              completed_at, created_at, updated_at
            ) VALUES (
              ${replayId}, ${workspaceId}, ${mailboxId}, ${webhookEndpointId}, 'queued',
              ${replayStartTime}, ${replayEndTime}, NULL, NULL, NULL, NULL, NOW(), NOW()
            )
          `;
        });

      try {
        const resultA = insertOverlappingReplay(clientA, "rpl_concurrent_a");
        const resultB = insertOverlappingReplay(clientB, "rpl_concurrent_b");

        await bothSelected;
        releaseInserts();

        const results = await Promise.allSettled([resultA, resultB]);
        const fulfilled = results.filter((result) => result.status === "fulfilled");
        const rejected = results.filter(
          (result): result is PromiseRejectedResult => result.status === "rejected",
        );

        expect(fulfilled).toHaveLength(1);
        expect(rejected).toHaveLength(1);
        const [rejection] = rejected;
        if (rejection === undefined) {
          throw new Error("Expected one rejected concurrent Replay insert.");
        }

        const rejectedReason: unknown = rejection.reason;
        if (
          typeof rejectedReason !== "object" ||
          rejectedReason === null ||
          !("code" in rejectedReason) ||
          typeof rejectedReason.code !== "string"
        ) {
          throw new Error("Expected concurrent Replay insert to fail with a Postgres error.");
        }

        const rejectedCode = rejectedReason.code;
        expect(["23P01", "40P01"]).toContain(rejectedCode);
        if (rejectedCode === "23P01") {
          const constraintName =
            "constraint_name" in rejectedReason &&
            typeof rejectedReason.constraint_name === "string"
              ? rejectedReason.constraint_name
              : undefined;

          expect(constraintName).toBe("replays_active_overlap_excl");
        }

        const persisted = await inspect<{ id: string }[]>`
          SELECT id
          FROM replays
          WHERE mailbox_id = ${mailboxId}
          ORDER BY id
        `;
        expect(persisted).toHaveLength(1);
      } finally {
        await Promise.all([clientA.end(), clientB.end(), inspect.end()]);
      }
    });
  });

  it("returns replay_conflict for concurrent overlapping Replay creates", async () => {
    await withIsolatedDatabasePromise(async ({ connectionString }) => {
      await seedReplayFixture(connectionString);

      const attempts = await Promise.all([
        Effect.runPromise(
          createReplay(workspaceId, {
            mailboxId,
            webhookEndpointId,
            startTime: replayStartTime,
            endTime: replayEndTime,
          }).pipe(Effect.exit, Effect.provide(runtimeLayer(connectionString))),
        ),
        Effect.runPromise(
          createReplay(workspaceId, {
            mailboxId,
            webhookEndpointId,
            startTime: "2026-04-10T10:20:00.000Z",
            endTime: "2026-04-10T10:45:00.000Z",
          }).pipe(Effect.exit, Effect.provide(runtimeLayer(connectionString))),
        ),
      ]);

      expect(attempts.filter(Exit.isSuccess)).toHaveLength(1);
      expect(
        attempts
          .filter(Exit.isFailure)
          .map((attempt) => Cause.findErrorOption(attempt.cause)),
      ).toEqual([
        Option.some(
          expect.objectContaining({
            code: "replay_conflict",
            status: 409,
          }),
        ),
      ]);
    });
  });

  it("completes empty Replay ranges with zero scheduled deliveries", async () => {
    await withIsolatedDatabasePromise(async ({ connectionString }) => {
      await seedReplayFixture(connectionString);

      const replay = await Effect.runPromise(
        createReplay(workspaceId, {
          mailboxId,
          webhookEndpointId,
          startTime: "2026-04-10T11:00:00.000Z",
          endTime: "2026-04-10T11:30:00.000Z",
        }).pipe(Effect.provide(runtimeLayer(connectionString))),
      );

      await Effect.runPromise(
        dispatchReplays({ observedAt: "2026-04-10T11:31:00.000Z" }).pipe(
          Effect.provide(runtimeLayer(connectionString)),
        ),
      );

      const completedReplay = await Effect.runPromise(
        getReplayOrFail(replay.id, { workspaceId }).pipe(
          Effect.provide(runtimeLayer(connectionString)),
        ),
      );
      const deliveries = await fetchWebhookDeliveries(connectionString);

      expect(completedReplay.status).toBe("completed");
      expect(completedReplay.eventsReplayed).toBe(0);
      expect(deliveries).toHaveLength(0);
    });
  });

  it("scopes Replay reads by workspace ownership", async () => {
    await withIsolatedDatabasePromise(async ({ connectionString }) => {
      await seedReplayFixture(connectionString);
      const replay = await Effect.runPromise(
        createReplay(workspaceId, {
          mailboxId,
          webhookEndpointId,
          startTime: replayStartTime,
          endTime: replayEndTime,
        }).pipe(Effect.provide(runtimeLayer(connectionString))),
      );

      const problem = await Effect.runPromise(
        getReplayOrFail(replay.id, { workspaceId: foreignWorkspaceId }).pipe(
          Effect.flip,
          Effect.provide(runtimeLayer(connectionString)),
        ),
      );

      expect(problem.code).toBe("replay_not_found");
      expect(problem.status).toBe(404);
    });
  });

  it("re-arms an existing webhook delivery while preserving the original Mailbox Event id", async () => {
    await withIsolatedDatabasePromise(async ({ connectionString }) => {
      await seedReplayFixture(connectionString);

      await Effect.runPromise(
        createReplay(workspaceId, {
          mailboxId,
          webhookEndpointId,
          startTime: "2026-04-10T10:15:00.000Z",
          endTime: "2026-04-10T10:15:00.000Z",
        }).pipe(Effect.provide(runtimeLayer(connectionString))),
      );
      await Effect.runPromise(
        dispatchReplays({ observedAt: "2026-04-10T10:31:00.000Z" }).pipe(
          Effect.provide(runtimeLayer(connectionString)),
        ),
      );

      const [originalDelivery] = await fetchWebhookDeliveries(connectionString);
      expect(originalDelivery?.mailboxEventId).toBe("evt_replay_2");

      const database = createDb(connectionString);
      try {
        await database.db
          .update(schema.webhookDeliveries)
          .set({
            attemptCount: 3,
            deliveredAt: new Date("2026-04-10T10:32:00.000Z"),
            state: "delivered",
          })
          .where(eq(schema.webhookDeliveries.id, originalDelivery?.id ?? ""));
      } finally {
        await database.client.end();
      }

      await Effect.runPromise(
        createReplay(workspaceId, {
          mailboxId,
          webhookEndpointId,
          startTime: "2026-04-10T10:15:00.000Z",
          endTime: "2026-04-10T10:15:00.000Z",
        }).pipe(Effect.provide(runtimeLayer(connectionString))),
      );
      await Effect.runPromise(
        dispatchReplays({ observedAt: "2026-04-10T10:45:00.000Z" }).pipe(
          Effect.provide(runtimeLayer(connectionString)),
        ),
      );

      const [rearmedDelivery] = await fetchWebhookDeliveries(connectionString);
      expect(rearmedDelivery?.id).toBe(originalDelivery?.id);
      expect(rearmedDelivery?.mailboxEventId).toBe("evt_replay_2");
      expect(rearmedDelivery?.attemptCount).toBe(0);
      expect(rearmedDelivery?.state).toBe("pending");
      expect(rearmedDelivery?.deliveredAt).toBeNull();
    });
  });
});
