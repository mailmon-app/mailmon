import {
  MailboxCatalog,
  MailboxSyncCoordinator,
  MailboxStateStore,
  SyncRunStore,
  type MailboxResource,
  type MailboxSyncLeaseAcquisition,
  type MailboxSyncLeaseRenewal,
} from "@mailmon/core";
import { Effect, Layer, Option, Ref } from "effect";

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

export const createBootstrapMailboxCatalogLayer = (
  mailboxes: ReadonlyArray<MailboxResource> = [defaultBootstrapMailbox],
) =>
  Layer.succeed(MailboxCatalog, {
    getMailbox: (mailboxId: string) =>
      Effect.succeed(Option.fromNullable(mailboxes.find((mailbox) => mailbox.id === mailboxId))),
  });

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

export const createBootstrapMailboxStateStoreLayer = Layer.succeed(MailboxStateStore, {
  getMailboxCursor: () => Effect.succeed(null),
  applySyncResult: () => Effect.succeed(true),
});

interface BootstrapMailboxLease {
  readonly leaseOwnerId: string;
  readonly expiresAt: string;
}

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
