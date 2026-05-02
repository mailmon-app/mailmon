import { describe, expect, it } from "@effect/vitest";
import { CliConfig } from "@mailmon/config";
import { Effect, Option } from "effect";

import {
  formatCreatedWorkspace,
  formatCreatedWorkspaceApiKey,
  formatGmailCredentialAuditSummary,
  formatGmailCredentialRewrapSummary,
  formatRevokedWorkspaceApiKey,
  getListenMessage,
  parseLastDurationMs,
} from "./app.js";

describe("getListenMessage", () => {
  it.effect("renders the configured async transport mode", () =>
    Effect.gen(function* () {
      const message = yield* getListenMessage({ forwardTo: Option.none() });

      expect(message).toBe("listening for local events using local async transport");
    }).pipe(Effect.provide(CliConfig.testLayer)),
  );

  it.effect("includes the forwarding target when requested", () =>
    Effect.gen(function* () {
      const message = yield* getListenMessage({
        forwardTo: Option.some("http://localhost:3000/webhooks/mailmon"),
      });

      expect(message).toContain("http://localhost:3000/webhooks/mailmon");
    }).pipe(Effect.provide(CliConfig.testLayer)),
  );
});

describe("phase 8 operator helpers", () => {
  it("parses replay durations", () => {
    expect(parseLastDurationMs("30m")).toBe(1_800_000);
    expect(parseLastDurationMs("2h")).toBe(7_200_000);
    expect(() => parseLastDurationMs("yesterday")).toThrow(/Duration must use/);
  });

  it("formats workspace creation output", () => {
    expect(formatCreatedWorkspace({ created: true, workspaceId: "ws_demo" })).toBe(
      "created workspace ws_demo",
    );
    expect(formatCreatedWorkspace({ created: false, workspaceId: "ws_demo" })).toBe(
      "workspace ws_demo already exists",
    );
  });

  it("formats generated API keys with the raw key visible exactly once", () => {
    expect(
      formatCreatedWorkspaceApiKey({
        apiKey: "mm_test_raw",
        apiKeyId: "wak_demo",
        keyPrefix: "mm_test_",
        workspaceId: "ws_demo",
      }),
    ).toBe(
      [
        "created workspace API key wak_demo for ws_demo",
        "prefix: mm_test_",
        "api_key: mm_test_raw",
      ].join("\n"),
    );
  });

  it("formats API key revocation output", () => {
    expect(formatRevokedWorkspaceApiKey({ apiKeyId: "wak_demo", revoked: true })).toBe(
      "revoked workspace API key wak_demo",
    );
    expect(formatRevokedWorkspaceApiKey({ apiKeyId: null, revoked: false })).toBe(
      "workspace API key was not found or was already revoked",
    );
  });
});

describe("gmail credential summaries", () => {
  it("formats audit counts for operator output", () => {
    expect(
      formatGmailCredentialAuditSummary({
        encryptedCurrent: 3,
        encryptedRewrapRequired: 2,
        plaintext: 1,
        total: 7,
        unreadable: 1,
      }),
    ).toBe("gmail credentials: 7 total, 3 current, 2 need rewrap, 1 plaintext, 1 unreadable");
  });

  it("formats rewrap counts for operator output", () => {
    expect(
      formatGmailCredentialRewrapSummary({
        alreadyCurrent: 3,
        markedReconnectRequired: 1,
        rewrapped: 2,
        staleSkipped: 1,
        total: 7,
        unreadable: 0,
      }),
    ).toBe(
      "gmail credential rewrap: 7 total, 2 rewrapped, 3 already current, 1 marked reconnect_required, 0 unreadable, 1 stale skipped",
    );
  });
});
