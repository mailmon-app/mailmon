import type { WorkerEnv } from "@mailmon/config";
import { describe, expect, it } from "vitest";

import { startWorkerRuntime } from "./index.js";

const workerEnvFixture: WorkerEnv = {
  asyncTransportMode: "local",
  databaseUrl: "postgres://mailmon:mailmon@localhost:5432/mailmon",
  gmailApiBaseUrl: "https://gmail.googleapis.com/gmail/v1",
  gmailOauthClientId: null,
  gmailOauthClientSecret: null,
  gmailOauthTokenUrl: "https://oauth2.googleapis.com/token",
  gcpProjectId: null,
  gcpRegion: null,
  host: "127.0.0.1",
  nodeEnv: "test",
  port: 0,
  redisUrl: null,
};

describe("startWorkerRuntime", () => {
  it("fails fast when gcp webhook delivery scheduling is requested", async () => {
    await expect(
      startWorkerRuntime({
        ...workerEnvFixture,
        asyncTransportMode: "gcp",
      }),
    ).rejects.toThrow(
      "MAILMON_ASYNC_TRANSPORT_MODE=gcp is not implemented for durable webhook delivery scheduling yet.",
    );
  });
});
