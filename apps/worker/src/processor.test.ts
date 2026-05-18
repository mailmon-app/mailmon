import { MailboxSyncLeaseTiming } from "@mailmon/core";
import { bootstrap } from "@mailmon/db";
import { createStubMailboxSyncProviderLayer } from "@mailmon/gmail";
import { Layer, ManagedRuntime } from "effect";
import { describe, expect, it } from "vitest";

import {
  createProcessControlJob,
  createProcessMailboxSyncDeadLetter,
  createProcessSyncJob,
  createProcessWebhookDelivery,
  withStagingPubSubRetrySmokeSyncFailure,
} from "./processor.js";

type ProcessorRuntime<T extends (...args: any) => any> = Parameters<T>[0];

describe("processSyncJob", () => {
  it("runs the mailbox-scoped sync workflow", async () => {
    const runtime = ManagedRuntime.make(
      Layer.mergeAll(
        bootstrap.createBootstrapMailboxCatalogLayer(),
        bootstrap.createBootstrapMailboxSyncCoordinatorLayer,
        bootstrap.createBootstrapMailboxStateStoreLayer,
        bootstrap.createBootstrapSyncRunStoreLayer,
        bootstrap.createBootstrapWebhookDeliveryStoreLayer,
        bootstrap.createBootstrapWebhookDeliverySchedulerLayer,
        MailboxSyncLeaseTiming.defaultLayer,
        createStubMailboxSyncProviderLayer,
      ),
    );
    const processSyncJob = createProcessSyncJob(runtime);

    await expect(processSyncJob({ mailboxId: "mbx_demo" })).resolves.toMatchObject({
      mailboxId: "mbx_demo",
      status: "completed",
      eventsEmitted: 1,
      nextCursor: "hist_bootstrap",
    });

    await runtime.dispose();
  });

  it("emits a structured contention log when sync is skipped due to an active lease", async () => {
    const logs: unknown[] = [];
    const result = {
      mailboxId: "mbx_demo",
      syncRunId: "sr_contended",
      startedAt: "2026-04-22T00:00:00.000Z",
      status: "skipped_due_to_active_lease" as const,
      completedAt: "2026-04-22T00:00:01.000Z",
      eventsEmitted: 0 as const,
      leaseOwnerId: "lease_active",
      nextCursor: null,
    };
    const runtime = {
      runPromise: async () => result,
    } satisfies ProcessorRuntime<typeof createProcessSyncJob>;

    const processSyncJob = createProcessSyncJob(runtime, {
      log: (event) => logs.push(event),
      transportMode: "gcp",
    });

    await expect(processSyncJob({ mailboxId: "mbx_demo" })).resolves.toMatchObject({
      status: "skipped_due_to_active_lease",
    });
    expect(logs).toEqual([
      {
        event: "mailbox_sync_lease_contention",
        mailboxId: "mbx_demo",
        syncRunId: "sr_contended",
        leaseOwnerId: "lease_active",
        transportMode: "gcp",
        occurredAt: "2026-04-22T00:00:01.000Z",
      },
    ]);
  });

  it("emits a structured lease-loss log before rethrowing lease loss failures", async () => {
    const logs: unknown[] = [];
    const runtime = {
      runPromise: async () => {
        throw {
          type: "https://api.mailmon.dev/problems/mailbox-sync-lease-lost",
          title: "Mailbox sync lease lost",
          status: 409,
          code: "mailbox_sync_lease_lost",
          detail: "Mailbox mbx_demo lost its active sync lease while processing.",
          resource: {
            mailbox_id: "mbx_demo",
            sync_run_id: "sr_lost",
            lease_owner_id: "lease_lost",
          },
          retryable: true,
        };
      },
    } satisfies ProcessorRuntime<typeof createProcessSyncJob>;

    const processSyncJob = createProcessSyncJob(runtime, {
      log: (event) => logs.push(event),
      transportMode: "gcp",
    });

    await expect(processSyncJob({ mailboxId: "mbx_demo" })).rejects.toMatchObject({
      code: "mailbox_sync_lease_lost",
    });
    expect(logs).toEqual([
      {
        event: "mailbox_sync_lease_lost",
        mailboxId: "mbx_demo",
        syncRunId: "sr_lost",
        leaseOwnerId: "lease_lost",
        transportMode: "gcp",
        occurredAt: expect.any(String),
      },
    ]);
  });

  it("forces a retryable staging Pub/Sub smoke failure for configured synthetic mailboxes", async () => {
    const logs: unknown[] = [];
    const processSyncJob = withStagingPubSubRetrySmokeSyncFailure(
      async ({ mailboxId }) => ({
        mailboxId,
        syncRunId: "sr_sync",
        startedAt: "2026-04-22T00:00:00.000Z",
        status: "completed" as const,
        completedAt: "2026-04-22T00:00:01.000Z",
        eventsEmitted: 0,
        nextCursor: "hist_456",
      }),
      new Set(["mbx_smoke"]),
      {
        log: (event) => logs.push(event),
        transportMode: "gcp",
      },
    );

    await expect(processSyncJob({ mailboxId: "mbx_smoke" })).rejects.toMatchObject({
      code: "staging_pubsub_retry_smoke_forced_retry",
      status: 503,
      retryable: true,
    });
    await expect(processSyncJob({ mailboxId: "mbx_normal" })).resolves.toMatchObject({
      mailboxId: "mbx_normal",
      status: "completed",
    });
    expect(logs).toEqual([
      {
        event: "mailbox_sync_staging_pubsub_retry_smoke_forced_retry",
        mailboxId: "mbx_smoke",
        transportMode: "gcp",
        occurredAt: expect.any(String),
      },
    ]);
  });
});

describe("processMailboxSyncDeadLetter", () => {
  it("records retry exhaustion and emits a structured exhaustion log", async () => {
    const logs: unknown[] = [];
    const result = {
      mailboxId: "mbx_demo",
      status: "recorded" as const,
      syncRunId: "sr_exhausted",
      recordedAt: "2026-04-23T00:00:00.000Z",
      detail: "mailbox_sync_dispatch_retry_exhausted" as const,
    };
    const runtime = {
      runPromise: async () => result,
    } satisfies ProcessorRuntime<typeof createProcessMailboxSyncDeadLetter>;

    const processMailboxSyncDeadLetter = createProcessMailboxSyncDeadLetter(runtime, {
      log: (event) => logs.push(event),
      transportMode: "gcp",
    });

    await expect(processMailboxSyncDeadLetter({ mailboxId: "mbx_demo" })).resolves.toEqual(result);
    expect(logs).toEqual([
      {
        event: "mailbox_sync_dispatch_retry_exhausted",
        mailboxId: "mbx_demo",
        syncRunId: "sr_exhausted",
        transportMode: "gcp",
        occurredAt: "2026-04-23T00:00:00.000Z",
        detail: "mailbox_sync_dispatch_retry_exhausted",
      },
    ]);
  });
});

describe("processWebhookDelivery", () => {
  it("emits a structured exhaustion log for retry_exhausted results", async () => {
    const logs: unknown[] = [];
    const result = {
      deliveryId: "del_demo",
      status: "retry_exhausted" as const,
      attemptCount: 5,
      nextAttemptAt: null,
    };
    const runtime = {
      runPromise: async () => result,
    } satisfies ProcessorRuntime<typeof createProcessWebhookDelivery>;

    const processWebhookDelivery = createProcessWebhookDelivery(runtime, {
      log: (event) => logs.push(event),
      transportMode: "gcp",
    });

    await expect(
      processWebhookDelivery({
        deliveryId: "del_demo",
        notBefore: "2026-04-23T00:00:00.000Z",
      }),
    ).resolves.toEqual(result);
    expect(logs).toEqual([
      {
        event: "webhook_delivery_retry_exhausted",
        deliveryId: "del_demo",
        attemptCount: 5,
        transportMode: "gcp",
        occurredAt: expect.any(String),
      },
    ]);
  });
});

describe("processControlJob", () => {
  it("emits structured stuck recovery logs for every cleared lease", async () => {
    const logs: unknown[] = [];
    const result = {
      completedAt: "2026-04-22T00:05:00.000Z",
      dispatched: 1,
      kind: "recover_stuck_syncs" as const,
      recovered: 1,
      recoveredExecutions: [
        {
          mailboxId: "mbx_demo",
          leaseOwnerId: "lease_stuck",
          syncRunId: "sr_stuck",
        },
      ],
      scanned: 1,
      skippedReconnectRequired: 0,
      status: "completed" as const,
    };
    // oxlint-disable-next-line typescript-eslint/no-unsafe-type-assertion -- test runtime ignores the Effect input and returns a fixed control result.
    const runtime = {
      runPromise: async () => result,
    } as unknown as Parameters<typeof createProcessControlJob>[0];

    const processControlJob = createProcessControlJob(runtime, {
      log: (event) => logs.push(event),
      transportMode: "gcp",
    });

    await expect(processControlJob({ kind: "recover_stuck_syncs" })).resolves.toMatchObject({
      kind: "recover_stuck_syncs",
      recovered: 1,
    });
    expect(logs).toEqual([
      {
        event: "mailbox_sync_stuck_recovery",
        mailboxId: "mbx_demo",
        syncRunId: "sr_stuck",
        leaseOwnerId: "lease_stuck",
        transportMode: "gcp",
        occurredAt: "2026-04-22T00:05:00.000Z",
      },
    ]);
  });

  it("emits structured webhook delivery scheduling recovery logs", async () => {
    const logs: unknown[] = [];
    const result = {
      completedAt: "2026-04-22T00:05:00.000Z",
      kind: "recover_webhook_deliveries" as const,
      recovered: 2,
      status: "completed" as const,
    };
    // oxlint-disable-next-line typescript-eslint/no-unsafe-type-assertion -- test runtime ignores the Effect input and returns a fixed control result.
    const runtime = {
      runPromise: async () => result,
    } as unknown as Parameters<typeof createProcessControlJob>[0];

    const processControlJob = createProcessControlJob(runtime, {
      log: (event) => logs.push(event),
      transportMode: "gcp",
    });

    await expect(processControlJob({ kind: "recover_webhook_deliveries" })).resolves.toMatchObject({
      kind: "recover_webhook_deliveries",
      recovered: 2,
    });
    expect(logs).toEqual([
      {
        event: "webhook_delivery_scheduling_recovery",
        recovered: 2,
        transportMode: "gcp",
        occurredAt: "2026-04-22T00:05:00.000Z",
      },
    ]);
  });
});
