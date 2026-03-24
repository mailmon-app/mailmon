import { describe, expect, it } from "vitest";

import { createApp } from "./server.js";

describe("createApp", () => {
  it("returns a healthy response", async () => {
    const response = await createApp().request("/health");

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ status: "ok" });
  });
});
