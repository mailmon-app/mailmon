import { describe, expect, it } from "@effect/vitest";
import { CliConfig } from "@mailmon/config";
import type { PreparedWebhookDelivery } from "@mailmon/core";
import { Effect, Option } from "effect";
import { vi } from "vitest";

import {
  formatCreatedWorkspace,
  formatCreatedWorkspaceApiKey,
  formatGmailCredentialAuditSummary,
  formatGmailCredentialRewrapSummary,
  formatRevokedWorkspaceApiKey,
  getListenMessage,
  parseControlJobKind,
  parseLastDurationMs,
  sendLocalWebhookEvent,
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

  it("parses supported control job kinds", () => {
    expect(parseControlJobKind("renew_watches")).toBe("renew_watches");
    expect(parseControlJobKind("recover_stuck_syncs")).toBe("recover_stuck_syncs");
    expect(parseControlJobKind("recover_webhook_deliveries")).toBe("recover_webhook_deliveries");
    expect(() => parseControlJobKind("daily_report")).toThrow(/Control job kind must be/);
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

describe("sendLocalWebhookEvent", () => {
  it("forwards local webhook events with canonical Mailmon headers and test signatures", async () => {
    const delivery: PreparedWebhookDelivery = {
      deliveryId: "del_demo",
      mailboxEventId: "evt_demo",
      webhookEndpointId: "whe_demo",
      attemptCount: 1,
      processingStartedAt: "2026-03-24T00:00:05.000Z",
      url: "https://stored.example.test/webhooks/mailmon",
      signingSecret: "whsec_stored",
      event: {
        id: "evt_demo",
        type: "message.created",
        schemaVersion: 1,
        occurredAt: "2026-03-24T00:00:00.000Z",
        workspaceId: "ws_123",
        tenantExternalId: "tenant_123",
        mailboxId: "mbx_demo",
        data: {
          messageId: "msg_demo",
          threadId: "thr_demo",
          providerMessageId: "gmail_msg_demo",
          providerThreadId: "gmail_thr_demo",
          subject: "Demo thread",
          snippet: "Mailbox message fixture",
          receivedAt: "2026-03-24T00:00:00.000Z",
          labelIds: ["INBOX"],
        },
      },
    };
    const fetch = vi.fn(async () => new Response("{}", { status: 202 }));
    const originalFetch = globalThis.fetch;
    globalThis.fetch = fetch as typeof globalThis.fetch;

    try {
      const result = await Effect.runPromise(
        sendLocalWebhookEvent({
          attemptedAt: "2026-03-24T00:00:05.000Z",
          delivery,
          forwardTo: "http://127.0.0.1:3000/webhooks/mailmon",
          signingSecret: "whsec_demo",
        }),
      );

      expect(result).toEqual({ statusCode: 202 });
      expect(fetch).toHaveBeenCalledWith("http://127.0.0.1:3000/webhooks/mailmon", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "user-agent": "mailmon-cli/phase-8",
          "x-mailmon-attempt": "1",
          "x-mailmon-delivery-id": "del_demo",
          "x-mailmon-event-id": "evt_demo",
          "x-mailmon-signature":
            "t=1774310405,v1=7d8ca193a0cb8c4b1e5501e13dca952b981f8354e21ded4dfdd562624c051fbc",
        },
        body: JSON.stringify(delivery.event),
      });
    } finally {
      globalThis.fetch = originalFetch;
    }
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
