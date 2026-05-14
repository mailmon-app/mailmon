import { describe, expect, it } from "@effect/vitest";
import { Effect, Layer, Option } from "effect";

import type { CompletedMailboxConnectSession, StoredConnectSession } from "./contracts.js";
import { completeGmailMailboxConnectSession } from "./mailbox-connect-sessions.js";
import {
  MailboxCatalog,
  MailboxConnectProvider,
  MailboxConnectSessionStore,
  MailboxSyncDispatcher,
} from "./services.js";

const completedReconnect: CompletedMailboxConnectSession = {
  created: false,
  redirectUrl: "https://app.example.com/callback",
  mailbox: {
    id: "mbx_reconnected",
    object: "mailbox",
    provider: "gmail",
    emailAddress: "demo@mailmon.dev",
    status: "active",
    syncState: "initializing",
    watchState: "expired",
    initializedAt: "2026-04-13T08:00:00.000Z",
    lastSuccessfulSyncAt: "2026-04-13T08:30:00.000Z",
    lastError: null,
  },
};

const pendingConnectSession: StoredConnectSession = {
  id: "mcs_reconnect",
  provider: "gmail",
  workspaceId: "ws_demo",
  tenantExternalId: "tenant_demo",
  mailboxExternalId: "mailbox_demo",
  redirectUrl: "https://app.example.com/callback",
  codeVerifier: "code-verifier",
  expiresAt: "2999-04-13T09:00:00.000Z",
  mailboxId: null,
  completedAt: null,
};

describe("completeGmailMailboxConnectSession", () => {
  it.effect("dispatches sync after a successful reconnect of an existing mailbox", () =>
    Effect.gen(function* () {
      const dispatchedMailboxIds: Array<string> = [];
      const layer = Layer.mergeAll(
        Layer.succeed(MailboxConnectSessionStore, {
          createConnectSession: () => Effect.succeed(pendingConnectSession),
          getConnectSession: () => Effect.succeed(Option.some(pendingConnectSession)),
          completeConnectSession: () => Effect.succeed(completedReconnect),
        }),
        Layer.succeed(MailboxCatalog, {
          getMailbox: () => Effect.succeed(Option.none()),
        }),
        Layer.succeed(MailboxConnectProvider, {
          createAuthorizationUrl: () => Effect.succeed("https://accounts.example.com/oauth"),
          completeAuthorization: () =>
            Effect.succeed({
              providerAccountEmail: "demo@mailmon.dev",
              refreshToken: "refresh-token",
            }),
        }),
        Layer.succeed(MailboxSyncDispatcher, {
          dispatchMailboxSync: (mailboxId) =>
            Effect.sync(() => {
              dispatchedMailboxIds.push(mailboxId);
            }),
        }),
      );

      const completed = yield* completeGmailMailboxConnectSession(
        "mcs_reconnect",
        "oauth-code",
        "https://api.mailmon.dev",
      ).pipe(Effect.provide(layer));

      expect(completed).toBe(completedReconnect);
      expect(dispatchedMailboxIds).toEqual(["mbx_reconnected"]);
    }),
  );
});
