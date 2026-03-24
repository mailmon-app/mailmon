import { describe, expect, it } from "vitest";

import { createStubGmailClient } from "./index.js";

describe("createStubGmailClient", () => {
  it("returns a no-op client", async () => {
    await expect(createStubGmailClient().watchMailbox("acct_123")).resolves.toBeUndefined();
  });
});
