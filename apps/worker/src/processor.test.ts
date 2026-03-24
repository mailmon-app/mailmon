import { describe, expect, it } from "vitest";

import { processSyncJob } from "./processor.js";

describe("processSyncJob", () => {
  it("runs the mailbox-scoped sync workflow", async () => {
    await expect(processSyncJob({ mailboxId: "mbx_demo" })).resolves.toMatchObject({
      mailboxId: "mbx_demo",
      syncRunId: "sr_1",
      eventsEmitted: 1,
      nextCursor: "hist_bootstrap",
    });
  });
});
