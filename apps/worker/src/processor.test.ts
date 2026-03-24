import { describe, expect, it } from "vitest";

import { processSyncJob } from "./processor.js";

describe("processSyncJob", () => {
  it("returns the placeholder payload", async () => {
    await expect(processSyncJob({ accountId: "acct_123" })).resolves.toEqual({
      accountId: "acct_123",
    });
  });
});
