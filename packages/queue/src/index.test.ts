import { describe, expect, it } from "vitest";

import { SYNC_ACCOUNT_QUEUE } from "./index.js";

describe("SYNC_ACCOUNT_QUEUE", () => {
  it("uses a stable queue name", () => {
    expect(SYNC_ACCOUNT_QUEUE).toBe("mailmon.sync-account");
  });
});
