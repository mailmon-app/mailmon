import { Effect, Option } from "effect";

import type { DispatchReplaysResult } from "./contracts.js";
import { ReplayStore, WebhookDeliveryScheduler, WebhookDeliveryStore } from "./services.js";

const DEFAULT_REPLAY_DISPATCH_BATCH_SIZE = 100;

export const dispatchReplays = (
  options: Readonly<{
    limit?: number;
    observedAt?: string;
  }> = {},
) =>
  Effect.gen(function* () {
    const observedAt = options.observedAt ?? new Date().toISOString();
    const limit = options.limit ?? DEFAULT_REPLAY_DISPATCH_BATCH_SIZE;
    const replayStore = yield* ReplayStore;
    const webhookDeliveryStore = yield* WebhookDeliveryStore;
    const webhookDeliveryScheduler = yield* WebhookDeliveryScheduler;
    const targets = yield* replayStore.listReplayDispatchTargets({
      limit,
      observedAt,
    });

    const outcomes = yield* Effect.forEach(
      targets,
      (target) =>
        replayStore
          .prepareReplayDispatch({
            replayId: target.id,
            startedAt: observedAt,
          })
          .pipe(
            Effect.flatMap((prepared) =>
              Option.match(prepared, {
                onNone: () =>
                  Effect.succeed({
                    dispatched: false,
                    eventsReplayed: 0,
                    failed: false,
                  }),
                onSome: (dispatch) =>
                  Effect.gen(function* () {
                    const deliveryRequests =
                      yield* webhookDeliveryStore.createWebhookDeliveriesForReplay({
                        mailboxEventIds: dispatch.mailboxEventIds,
                        notBefore: observedAt,
                        replayId: dispatch.replay.id,
                        webhookEndpointId: dispatch.replay.webhookEndpointId,
                      });

                    yield* Effect.forEach(
                      deliveryRequests,
                      (request) => webhookDeliveryScheduler.scheduleWebhookDelivery(request),
                      { discard: true },
                    );

                    yield* replayStore.completeReplayDispatch({
                      replayId: dispatch.replay.id,
                      completedAt: observedAt,
                      eventsReplayed: deliveryRequests.length,
                    });

                    return {
                      dispatched: true,
                      eventsReplayed: deliveryRequests.length,
                      failed: false,
                    } as const;
                  }),
              }),
            ),
          ),
      { concurrency: 10 },
    );

    return {
      completedAt: observedAt,
      dispatched: outcomes.filter((outcome) => outcome.dispatched).length,
      eventsReplayed: outcomes.reduce((total, outcome) => total + outcome.eventsReplayed, 0),
      failed: outcomes.filter((outcome) => outcome.failed).length,
      kind: "dispatch_replays",
      scanned: targets.length,
      status: "completed",
    } satisfies DispatchReplaysResult;
  });
