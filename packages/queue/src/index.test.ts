import { describe, expect, it } from "vitest";

import { createMailboxSyncJobData, SYNC_MAILBOX_QUEUE } from "./index.js";

describe("SYNC_MAILBOX_QUEUE", () => {
  it("uses a stable queue name", () => {
    expect(SYNC_MAILBOX_QUEUE).toBe("mailmon.sync-mailbox");
  });
});

describe("createMailboxSyncJobData", () => {
  it("uses mailbox ids as the unit of work", () => {
    expect(createMailboxSyncJobData("mbx_123")).toEqual({
      mailboxId: "mbx_123",
    });
  });
});
