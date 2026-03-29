import { bootstrap } from "@mailmon/db";
import { createStubMailboxSyncProviderLayer } from "@mailmon/gmail";
import { Layer, ManagedRuntime } from "effect";
import { describe, expect, it } from "vitest";

import { createProcessSyncJob } from "./processor.js";

describe("processSyncJob", () => {
  it("runs the mailbox-scoped sync workflow", async () => {
    const runtime = ManagedRuntime.make(
      Layer.mergeAll(
        bootstrap.createBootstrapMailboxCatalogLayer(),
        bootstrap.createBootstrapMailboxSyncCoordinatorLayer,
        bootstrap.createBootstrapMailboxStateStoreLayer,
        bootstrap.createBootstrapSyncRunStoreLayer,
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
});
