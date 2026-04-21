import { describe, expect, it } from "@effect/vitest";
import { CliConfig } from "@mailmon/config";
import { Effect, Option } from "effect";

import {
  formatGmailCredentialAuditSummary,
  formatGmailCredentialRewrapSummary,
  getListenMessage,
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
