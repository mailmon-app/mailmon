import { describe, expect, it } from "vitest";

import { createApiRuntimeLayer } from "./runtime.js";

const baseEnv = {
  asyncTransportMode: "local" as const,
  databaseUrl: "postgres://mailmon:mailmon@localhost:5432/mailmon",
  gmailApiBaseUrl: "https://gmail.googleapis.com/gmail/v1",
  gmailOauthAuthorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
  gmailOauthClientId: null,
  gmailOauthClientSecret: null,
  gmailOauthTokenUrl: "https://oauth2.googleapis.com/token",
  gmailRefreshTokenEncryptionKey: "BwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwc=",
  gmailRefreshTokenEncryptionKeyId: "primary",
  gmailRefreshTokenPreviousEncryptionKeys: [],
  nodeEnv: "test" as const,
  syncDispatchPubSubTopicName: null,
  workerBaseUrl: "http://127.0.0.1:3001",
};

describe("createApiRuntimeLayer", () => {
  it("throws for legacy_bullmq mode", () => {
    expect(() =>
      createApiRuntimeLayer({
        ...baseEnv,
        asyncTransportMode: "legacy_bullmq",
      }),
    ).toThrow(/does not support MAILMON_ASYNC_TRANSPORT_MODE=legacy_bullmq/);
  });

  it("requires the sync dispatch Pub/Sub topic in gcp mode", () => {
    expect(() =>
      createApiRuntimeLayer({
        ...baseEnv,
        asyncTransportMode: "gcp",
        syncDispatchPubSubTopicName: null,
      }),
    ).toThrow(/MAILMON_SYNC_DISPATCH_PUBSUB_TOPIC_NAME is required/);
  });

  it("creates a layer for local mode", () => {
    expect(() => createApiRuntimeLayer(baseEnv)).not.toThrow();
  });
});
