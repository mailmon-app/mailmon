import { describe, expect, it } from "vitest";

import { createApp } from "./server.js";

describe("createApp", () => {
  it("returns a healthy response", async () => {
    const response = await createApp().request("/health");

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ status: "ok" });
  });

  it("returns a mailbox resource from the core query flow", async () => {
    const response = await createApp().request("/v1/mailboxes/mbx_demo");

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
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
    });
  });

  it("maps structured problems to HTTP responses", async () => {
    const response = await createApp().request("/v1/mailboxes/mbx_missing");

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({
      code: "mailbox_not_found",
      status: 404,
      resource: {
        mailbox_id: "mbx_missing",
      },
    });
  });
});
