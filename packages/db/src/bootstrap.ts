import {
  MailboxCatalog,
  MailboxSyncCoordinator,
  MailboxStateStore,
  SyncRunStore,
  type MailboxResource,
  type MailboxSyncLeaseAcquisition,
  type MailboxSyncLeaseRenewal,
  WebhookDeliveryScheduler,
  WebhookDeliveryStore,
} from "@mailmon/core";
import { Effect, Layer, Option, Ref } from "effect";

/** @public */
export const defaultBootstrapMailbox: MailboxResource = {
  id: "mbx_demo",
  object: "mailbox",
  provider: "gmail",
  emailAddress: "demo@mailmon.dev",
  status: "active",
  syncState: "healthy",
  watchState: "active",
  initializedAt: null,
  lastSuccessfulSyncAt: null,
  lastError: null,
};

/** @public */
export const createBootstrapMailboxCatalogLayer = (
  mailboxes: ReadonlyArray<MailboxResource> = [defaultBootstrapMailbox],
) =>
  Layer.succeed(MailboxCatalog, {
    getMailbox: (mailboxId: string) =>
      Effect.succeed(Option.fromNullable(mailboxes.find((mailbox) => mailbox.id === mailboxId))),
  });

/** @public */
export const createBootstrapSyncRunStoreLayer = Layer.effect(
  SyncRunStore,
  Effect.gen(function* () {
    const counter = yield* Ref.make(0);

    return {
      startSyncRun: (mailboxId: string) =>
        Ref.updateAndGet(counter, (value) => value + 1).pipe(
          Effect.map((value) => ({
            syncRunId: `sr_${value}`,
            mailboxId,
            startedAt: new Date().toISOString(),
          })),
        ),
      completeSyncRun: () => Effect.void,
    };
  }),
);

/** @public */
export const createBootstrapMailboxStateStoreLayer = Layer.succeed(MailboxStateStore, {
  getMailboxCursor: () => Effect.succeed(null),
  applySyncResult: ({ eventsEmitted }) =>
    Effect.succeed({
      applied: true,
      mailboxEventIds: Array.from(
        { length: eventsEmitted },
        (_, index) => `evt_bootstrap_${index}`,
      ),
    }),
});

/** @public */
export const createBootstrapWebhookDeliveryStoreLayer = Layer.succeed(WebhookDeliveryStore, {
  createWebhookDeliveriesForMailboxEvents: (mailboxEventIds) =>
    Effect.succeed(
      mailboxEventIds.map((mailboxEventId) => ({
        deliveryId: `del_${mailboxEventId}`,
        notBefore: new Date().toISOString(),
      })),
    ),
  createWebhookDeliveriesForReplay: ({ mailboxEventIds, notBefore, replayId }) =>
    Effect.succeed(
      mailboxEventIds.map((mailboxEventId) => ({
        deliveryId: `del_${replayId}_${mailboxEventId}`,
        notBefore,
      })),
    ),
  listWebhookDeliveryRecoverySchedules: () => Effect.succeed([]),
  prepareWebhookDeliveryAttempt: () => Effect.succeed(Option.none()),
  completeWebhookDeliveryAttempt: () => Effect.succeed(true),
});

/** @public */
export const createBootstrapWebhookDeliverySchedulerLayer = Layer.succeed(
  WebhookDeliveryScheduler,
  {
    scheduleWebhookDelivery: () => Effect.void,
  },
);

interface BootstrapMailboxLease {
  readonly leaseOwnerId: string;
  readonly expiresAt: string;
}

/** @public */
export const createBootstrapMailboxSyncCoordinatorLayer = Layer.effect(
  MailboxSyncCoordinator,
  Effect.gen(function* () {
    const leases = yield* Ref.make(new Map<string, BootstrapMailboxLease>());

    return {
      acquireMailboxSyncLease: ({
        mailboxId,
        leaseOwnerId,
        expiresAt,
        acquiredAt,
      }: {
        readonly mailboxId: string;
        readonly syncRunId: string;
        readonly leaseOwnerId: string;
        readonly acquiredAt: string;
        readonly expiresAt: string;
      }) =>
        Ref.modify(
          leases,
          (
            currentLeases,
          ): readonly [MailboxSyncLeaseAcquisition, Map<string, BootstrapMailboxLease>] => {
            const nextLeases = new Map(currentLeases);
            const existing = nextLeases.get(mailboxId);
            const hasLiveLease =
              existing !== undefined && Date.parse(existing.expiresAt) > Date.parse(acquiredAt);

            if (hasLiveLease) {
              return [
                {
                  acquired: false,
                  expiresAt: existing.expiresAt,
                  leaseOwnerId: existing.leaseOwnerId,
                },
                currentLeases,
              ] as const;
            }

            nextLeases.set(mailboxId, {
              leaseOwnerId,
              expiresAt,
            });

            return [
              {
                acquired: true,
                expiresAt,
                leaseOwnerId,
              },
              nextLeases,
            ] as const;
          },
        ),
      renewMailboxSyncLease: ({
        mailboxId,
        leaseOwnerId,
        expiresAt,
      }: {
        readonly mailboxId: string;
        readonly leaseOwnerId: string;
        readonly heartbeatAt: string;
        readonly expiresAt: string;
      }) =>
        Ref.modify(
          leases,
          (
            currentLeases,
          ): readonly [MailboxSyncLeaseRenewal, Map<string, BootstrapMailboxLease>] => {
            const nextLeases = new Map(currentLeases);
            const existing = nextLeases.get(mailboxId);

            if (existing?.leaseOwnerId !== leaseOwnerId) {
              return [
                {
                  renewed: false,
                  expiresAt: existing?.expiresAt ?? null,
                },
                currentLeases,
              ] as const;
            }

            nextLeases.set(mailboxId, {
              leaseOwnerId,
              expiresAt,
            });

            return [
              {
                renewed: true,
                expiresAt,
              },
              nextLeases,
            ] as const;
          },
        ),
      releaseMailboxSyncLease: ({
        mailboxId,
        leaseOwnerId,
      }: {
        readonly mailboxId: string;
        readonly leaseOwnerId: string;
      }) =>
        Ref.update(leases, (currentLeases) => {
          const nextLeases = new Map(currentLeases);
          const existing = nextLeases.get(mailboxId);

          if (existing?.leaseOwnerId === leaseOwnerId) {
            nextLeases.delete(mailboxId);
          }

          return nextLeases;
        }),
    };
  }),
);
