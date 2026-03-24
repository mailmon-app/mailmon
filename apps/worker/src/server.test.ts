import type { WorkerEnv } from "@mailmon/config";
import { afterEach, describe, expect, it } from "vitest";

import { startWorkerHttpRuntime } from "./server.js";

const activeRuntimeClosers: Array<() => Promise<void>> = [];

afterEach(async () => {
  await Promise.all(activeRuntimeClosers.splice(0).map((close) => close()));
});

const workerEnvFixture: WorkerEnv = {
  asyncTransportMode: "local",
  databaseUrl: "postgres://mailmon:mailmon@localhost:5432/mailmon",
  gcpProjectId: null,
  gcpRegion: null,
  host: "127.0.0.1",
  nodeEnv: "test",
  port: 0,
  redisUrl: null,
};

describe("startWorkerHttpRuntime", () => {
  it("serves a health response in local mode", async () => {
    const runtime = await startWorkerHttpRuntime({
      asyncTransportMode: workerEnvFixture.asyncTransportMode,
      host: workerEnvFixture.host,
      port: workerEnvFixture.port,
      processSyncJob: async ({ mailboxId }) => ({
        mailboxId,
        syncRunId: "sr_health",
        startedAt: "2026-03-25T00:00:00.000Z",
        status: "completed",
        completedAt: "2026-03-25T00:00:01.000Z",
        eventsEmitted: 1,
        nextCursor: "hist_123",
      }),
    });
    activeRuntimeClosers.push(runtime.close);

    const response = await fetch(`http://${runtime.host}:${runtime.port}/health`);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      status: "ok",
      transportMode: "local",
    });
  });

  it("runs the mailbox sync workflow through /internal/sync", async () => {
    const runtime = await startWorkerHttpRuntime({
      asyncTransportMode: workerEnvFixture.asyncTransportMode,
      host: workerEnvFixture.host,
      port: workerEnvFixture.port,
      processSyncJob: async ({ mailboxId }) => ({
        mailboxId,
        syncRunId: "sr_sync",
        startedAt: "2026-03-25T00:00:00.000Z",
        status: "completed",
        completedAt: "2026-03-25T00:00:01.000Z",
        eventsEmitted: 2,
        nextCursor: "hist_456",
      }),
    });
    activeRuntimeClosers.push(runtime.close);

    const response = await fetch(`http://${runtime.host}:${runtime.port}/internal/sync`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        mailboxId: "mbx_demo",
      }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      mailboxId: "mbx_demo",
      status: "completed",
      nextCursor: "hist_456",
    });
  });

  it("rejects invalid sync payloads", async () => {
    const runtime = await startWorkerHttpRuntime({
      asyncTransportMode: workerEnvFixture.asyncTransportMode,
      host: workerEnvFixture.host,
      port: workerEnvFixture.port,
      processSyncJob: async ({ mailboxId }) => ({
        mailboxId,
        syncRunId: "sr_sync",
        startedAt: "2026-03-25T00:00:00.000Z",
        status: "completed",
        completedAt: "2026-03-25T00:00:01.000Z",
        eventsEmitted: 2,
        nextCursor: "hist_456",
      }),
    });
    activeRuntimeClosers.push(runtime.close);

    const response = await fetch(`http://${runtime.host}:${runtime.port}/internal/sync`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        mailboxId: "",
      }),
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      code: "invalid_mailbox_sync_request",
    });
  });
});
