import { Effect } from "effect";

import type {
  ControlJobDispatchRequest,
  ControlJobRunResult,
  DispatchReplaysResult,
  NoopControlJobResult,
  RecoverWebhookDeliverySchedulingResult,
  RecoverStuckMailboxSyncExecutionsResult,
  RenewMailboxWatchesResult,
  RepairMailboxesResult,
} from "./contracts.js";
import { scheduleWebhookDeliveryRequests } from "./mailbox-event-delivery-scheduling.js";
import { recoverStuckMailboxSyncExecutions } from "./mailbox-execution-recovery.js";
import { repairMailboxes } from "./mailbox-repair.js";
import { renewExpiringMailboxWatches } from "./mailbox-watch-renewal.js";
import { dispatchReplays } from "./replay-dispatch.js";
import {
  MailboxExecutionRecoveryStore,
  MailboxRepairStore,
  MailboxSyncDispatcher,
  MailboxWatchProvider,
  MailboxWatchStore,
  ReplayStore,
  WebhookDeliveryScheduler,
  WebhookDeliveryStore,
} from "./services.js";

export const recoverWebhookDeliveryScheduling = (recoveredAt = new Date().toISOString()) =>
  Effect.gen(function* () {
    const webhookDeliveryStore = yield* WebhookDeliveryStore;
    const deliveryRequests =
      yield* webhookDeliveryStore.listWebhookDeliveryRecoverySchedules(recoveredAt);

    if (deliveryRequests.length === 0) {
      return [] as const;
    }

    return yield* scheduleWebhookDeliveryRequests(deliveryRequests);
  });

export const recoverWebhookDeliverySchedulingControlJob = (
  options: Readonly<{
    recoveredAt?: string;
  }> = {},
) =>
  Effect.gen(function* () {
    const recoveredAt = options.recoveredAt ?? new Date().toISOString();
    const deliveryRequests = yield* recoverWebhookDeliveryScheduling(recoveredAt);

    return {
      completedAt: recoveredAt,
      kind: "recover_webhook_deliveries",
      recovered: deliveryRequests.length,
      status: "completed",
    } satisfies RecoverWebhookDeliverySchedulingResult;
  });

export function runControlJob(
  request: Readonly<{ kind: "renew_watches" }>,
): Effect.Effect<RenewMailboxWatchesResult, never, MailboxWatchProvider | MailboxWatchStore>;
export function runControlJob(
  request: Readonly<{ kind: "repair_mailboxes" }>,
): Effect.Effect<RepairMailboxesResult, never, MailboxRepairStore | MailboxSyncDispatcher>;
export function runControlJob(
  request: Readonly<{ kind: "recover_stuck_syncs" }>,
): Effect.Effect<
  RecoverStuckMailboxSyncExecutionsResult,
  never,
  MailboxExecutionRecoveryStore | MailboxSyncDispatcher
>;
export function runControlJob(
  request: Readonly<{ kind: "recover_webhook_deliveries" }>,
): Effect.Effect<
  RecoverWebhookDeliverySchedulingResult,
  never,
  WebhookDeliveryScheduler | WebhookDeliveryStore
>;
export function runControlJob(
  request: Readonly<{ kind: "dispatch_replays" }>,
): Effect.Effect<
  DispatchReplaysResult,
  never,
  ReplayStore | WebhookDeliveryScheduler | WebhookDeliveryStore
>;
export function runControlJob(
  request: Readonly<{ kind: "cleanup" }>,
): Effect.Effect<NoopControlJobResult>;
export function runControlJob(
  request: ControlJobDispatchRequest,
): Effect.Effect<
  ControlJobRunResult,
  never,
  | MailboxExecutionRecoveryStore
  | MailboxRepairStore
  | MailboxSyncDispatcher
  | MailboxWatchProvider
  | MailboxWatchStore
  | ReplayStore
  | WebhookDeliveryScheduler
  | WebhookDeliveryStore
>;
export function runControlJob(
  request: ControlJobDispatchRequest,
): Effect.Effect<
  ControlJobRunResult,
  never,
  | MailboxExecutionRecoveryStore
  | MailboxRepairStore
  | MailboxSyncDispatcher
  | MailboxWatchProvider
  | MailboxWatchStore
  | ReplayStore
  | WebhookDeliveryScheduler
  | WebhookDeliveryStore
> {
  switch (request.kind) {
    case "renew_watches":
      return renewExpiringMailboxWatches();
    case "cleanup":
      return Effect.succeed({
        completedAt: new Date().toISOString(),
        kind: request.kind,
        status: "noop",
      });
    case "dispatch_replays":
      return dispatchReplays();
    case "repair_mailboxes":
      return repairMailboxes();
    case "recover_stuck_syncs":
      return recoverStuckMailboxSyncExecutions();
    case "recover_webhook_deliveries":
      return recoverWebhookDeliverySchedulingControlJob();
  }

  return Effect.succeed({
    completedAt: new Date().toISOString(),
    kind: request.kind,
    status: "noop",
  });
}
