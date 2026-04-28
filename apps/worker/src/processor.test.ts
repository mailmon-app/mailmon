import { bootstrap } from "@mailmon/db";
import { createStubMailboxSyncProviderLayer } from "@mailmon/gmail";
import { Layer, ManagedRuntime } from "effect";
import { describe, expect, it } from "vitest";

import { createProcessControlJob, createProcessSyncJob } from "./processor.js";

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
    // oxlint-disable-next-line typescript-eslint/no-unsafe-type-assertion -- test runtime ignores the Effect input and returns a fixed sync result.
    const runtime = {
      runPromise: async () => result,
    } as unknown as Parameters<typeof createProcessSyncJob>[0];

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
    // oxlint-disable-next-line typescript-eslint/no-unsafe-type-assertion -- test runtime ignores the Effect input and throws a fixed problem.
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
    } as unknown as Parameters<typeof createProcessSyncJob>[0];

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
});
