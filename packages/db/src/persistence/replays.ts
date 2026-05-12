import { ReplayStore, makeProblem, replayConflict } from "@mailmon/core";
import { and, asc, eq, gte, inArray, lte } from "drizzle-orm";
import { Effect, Layer, Option } from "effect";

import { mailboxEvents, replays } from "../schema.js";
import { MailmonDatabase } from "./database.js";
import { toDate, toReplayResource } from "./mappers.js";
import {
  isPostgresDeadlockDetected,
  isProblemDetails,
  isReplayActiveOverlapConstraintViolation,
} from "./problems.js";

export const createReplayStoreLayer = Layer.effect(
  ReplayStore,
  Effect.gen(function* () {
    const database = yield* MailmonDatabase;

    return {
      createReplay: (params) =>
        Effect.tryPromise({
          try: async () => {
            const startTime = toDate(params.startTime);
            const endTime = toDate(params.endTime);
            const createdAt = toDate(params.createdAt);

            const findCommittedConflict = async () => {
              const [conflict] = await database.db
                .select({
                  id: replays.id,
                })
                .from(replays)
                .where(
                  and(
                    eq(replays.workspaceId, params.workspaceId),
                    eq(replays.mailboxId, params.mailboxId),
                    eq(replays.webhookEndpointId, params.webhookEndpointId),
                    inArray(replays.status, ["queued", "running"]),
                    lte(replays.startTime, endTime),
                    gte(replays.endTime, startTime),
                  ),
                )
                .orderBy(asc(replays.createdAt), asc(replays.id))
                .limit(1);

              return conflict;
            };

            const findCommittedConflictAfterRace = async () => {
              for (const delayMilliseconds of [0, 10, 25, 50]) {
                if (delayMilliseconds > 0) {
                  await new Promise((resolve) => setTimeout(resolve, delayMilliseconds));
                }

                const conflict = await findCommittedConflict();
                if (conflict !== undefined) {
                  return conflict;
                }
              }

              return undefined;
            };

            try {
              return await database.db.transaction(async (transaction) => {
                const [conflict] = await transaction
                  .select({
                    id: replays.id,
                  })
                  .from(replays)
                  .where(
                    and(
                      eq(replays.workspaceId, params.workspaceId),
                      eq(replays.mailboxId, params.mailboxId),
                      eq(replays.webhookEndpointId, params.webhookEndpointId),
                      inArray(replays.status, ["queued", "running"]),
                      lte(replays.startTime, endTime),
                      gte(replays.endTime, startTime),
                    ),
                  )
                  .orderBy(asc(replays.createdAt), asc(replays.id))
                  .limit(1);

                if (conflict !== undefined) {
                  throw replayConflict(params.mailboxId, params.webhookEndpointId, conflict.id);
                }

                const [createdReplay] = await transaction
                  .insert(replays)
                  .values({
                    id: params.id,
                    workspaceId: params.workspaceId,
                    mailboxId: params.mailboxId,
                    webhookEndpointId: params.webhookEndpointId,
                    status: "queued",
                    startTime,
                    endTime,
                    eventsReplayed: null,
                    lastError: null,
                    startedAt: null,
                    completedAt: null,
                    createdAt,
                    updatedAt: createdAt,
                  })
                  .returning();

                if (createdReplay === undefined) {
                  throw new Error(`Replay ${params.id} could not be created.`);
                }

                return toReplayResource(createdReplay);
              });
            } catch (error) {
              if (
                isReplayActiveOverlapConstraintViolation(error) ||
                isPostgresDeadlockDetected(error)
              ) {
                const conflict = isPostgresDeadlockDetected(error)
                  ? await findCommittedConflictAfterRace()
                  : await findCommittedConflict();
                if (
                  conflict !== undefined ||
                  isReplayActiveOverlapConstraintViolation(error) ||
                  isPostgresDeadlockDetected(error)
                ) {
                  throw replayConflict(
                    params.mailboxId,
                    params.webhookEndpointId,
                    conflict?.id ?? params.id,
                  );
                }
              }

              throw error;
            }
          },
          catch: (error) =>
            isProblemDetails(error)
              ? error
              : makeProblem({
                  type: "https://api.mailmon.dev/problems/replay-create-failed",
                  title: "Replay create failed",
                  status: 500,
                  code: "replay_create_failed",
                  detail: error instanceof Error ? error.message : "Replay could not be created.",
                  retryable: true,
                }),
        }),
      getReplay: (replayId, options = {}) =>
        Effect.promise(async () => {
          const [row] = await database.db
            .select()
            .from(replays)
            .where(
              options.workspaceId === undefined
                ? eq(replays.id, replayId)
                : and(eq(replays.id, replayId), eq(replays.workspaceId, options.workspaceId)),
            )
            .limit(1);

          return Option.fromNullishOr(row).pipe(Option.map(toReplayResource));
        }),
      listReplayDispatchTargets: ({ limit }) =>
        Effect.promise(async () => {
          const rows = await database.db
            .select()
            .from(replays)
            .where(eq(replays.status, "queued"))
            .orderBy(asc(replays.createdAt), asc(replays.id))
            .limit(limit);

          return rows.map((row) => toReplayResource(row));
        }),
      prepareReplayDispatch: ({ replayId, startedAt }) =>
        Effect.promise(async () => {
          const startedAtDate = toDate(startedAt);

          return database.db.transaction(async (transaction) => {
            const [claimedReplay] = await transaction
              .update(replays)
              .set({
                lastError: null,
                startedAt: startedAtDate,
                status: "running",
                updatedAt: startedAtDate,
              })
              .where(and(eq(replays.id, replayId), eq(replays.status, "queued")))
              .returning();

            if (claimedReplay === undefined) {
              return Option.none();
            }

            const eventRows = await transaction
              .select({
                id: mailboxEvents.id,
              })
              .from(mailboxEvents)
              .where(
                and(
                  eq(mailboxEvents.mailboxId, claimedReplay.mailboxId),
                  gte(mailboxEvents.occurredAt, claimedReplay.startTime),
                  lte(mailboxEvents.occurredAt, claimedReplay.endTime),
                ),
              )
              .orderBy(asc(mailboxEvents.occurredAt), asc(mailboxEvents.id));

            return Option.some({
              replay: toReplayResource(claimedReplay),
              mailboxEventIds: eventRows.map((event) => event.id),
            });
          });
        }),
      completeReplayDispatch: ({ replayId, completedAt, eventsReplayed }) =>
        Effect.promise(async () => {
          const completedAtDate = toDate(completedAt);

          await database.db
            .update(replays)
            .set({
              completedAt: completedAtDate,
              eventsReplayed,
              lastError: null,
              status: "completed",
              updatedAt: completedAtDate,
            })
            .where(and(eq(replays.id, replayId), eq(replays.status, "running")));
        }),
      failReplayDispatch: ({ replayId, completedAt, error }) =>
        Effect.promise(async () => {
          const completedAtDate = toDate(completedAt);

          await database.db
            .update(replays)
            .set({
              completedAt: completedAtDate,
              lastError: error,
              status: "failed",
              updatedAt: completedAtDate,
            })
            .where(eq(replays.id, replayId));
        }),
    };
  }),
);
