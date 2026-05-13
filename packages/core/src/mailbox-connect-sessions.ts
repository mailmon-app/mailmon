import { Effect, Option } from "effect";

import type {
  ConnectSessionResource,
  CreateConnectSessionRequest,
  StoredConnectSession,
} from "./contracts.js";
import { connectSessionExpired, connectSessionNotFound } from "./problems.js";
import { getMailboxOrFail } from "./resource-queries.js";
import {
  MailboxConnectProvider,
  MailboxConnectSessionStore,
  MailboxSyncDispatcher,
} from "./services.js";

const DEFAULT_CONNECT_SESSION_TTL_MS = 15 * 60_000;

const addMillisecondsToIsoTimestamp = (timestamp: string, milliseconds: number) => {
  return new Date(Date.parse(timestamp) + milliseconds).toISOString();
};

const trimTrailingSlash = (value: string) => {
  return value.endsWith("/") ? value.slice(0, -1) : value;
};

const buildHostedGmailConnectUrl = (connectBaseUrl: string, connectSessionId: string) => {
  return `${trimTrailingSlash(connectBaseUrl)}/oauth/gmail/${connectSessionId}`;
};

const buildGmailConnectRedirectUri = (connectBaseUrl: string) => {
  return `${trimTrailingSlash(connectBaseUrl)}/oauth/gmail/callback`;
};

const createConnectSessionCodeVerifier = () => {
  return `${globalThis.crypto.randomUUID()}${globalThis.crypto.randomUUID()}`;
};

const createConnectSessionId = () => {
  return `mcs_${globalThis.crypto.randomUUID()}`;
};

const isConnectSessionExpired = (
  connectSession: Readonly<Pick<StoredConnectSession, "completedAt" | "expiresAt">>,
  observedAt: string,
) => {
  return (
    connectSession.completedAt === null &&
    Date.parse(connectSession.expiresAt) <= Date.parse(observedAt)
  );
};

export const getConnectSessionOrFail = (connectSessionId: string) =>
  Effect.gen(function* () {
    const connectSessionStore = yield* MailboxConnectSessionStore;
    const connectSession = yield* connectSessionStore.getConnectSession(connectSessionId);

    return yield* Option.match(connectSession, {
      onNone: () => Effect.fail(connectSessionNotFound(connectSessionId)),
      onSome: (value) => Effect.succeed(value),
    });
  });

export const createMailboxConnectSession = (
  workspaceId: string,
  request: CreateConnectSessionRequest,
  connectBaseUrl: string,
) =>
  Effect.gen(function* () {
    const connectSessionStore = yield* MailboxConnectSessionStore;
    const createdAt = new Date().toISOString();
    const connectSession = yield* connectSessionStore.createConnectSession({
      id: createConnectSessionId(),
      codeVerifier: createConnectSessionCodeVerifier(),
      expiresAt: addMillisecondsToIsoTimestamp(createdAt, DEFAULT_CONNECT_SESSION_TTL_MS),
      mailboxExternalId: request.mailboxExternalId,
      provider: request.provider,
      redirectUrl: request.redirectUrl,
      tenantExternalId: request.tenantExternalId,
      workspaceId,
    });

    const resource: ConnectSessionResource = {
      id: connectSession.id,
      object: "connect_session",
      connectUrl: buildHostedGmailConnectUrl(connectBaseUrl, connectSession.id),
      expiresAt: connectSession.expiresAt,
    };

    return resource;
  });

export const getGmailMailboxConnectAuthorizationUrl = (
  connectSessionId: string,
  connectBaseUrl: string,
) =>
  Effect.gen(function* () {
    const connectSession = yield* getConnectSessionOrFail(connectSessionId);

    if (isConnectSessionExpired(connectSession, new Date().toISOString())) {
      return yield* Effect.fail(connectSessionExpired(connectSessionId));
    }

    const mailboxConnectProvider = yield* MailboxConnectProvider;

    return yield* mailboxConnectProvider.createAuthorizationUrl({
      codeVerifier: connectSession.codeVerifier,
      connectSessionId: connectSession.id,
      redirectUri: buildGmailConnectRedirectUri(connectBaseUrl),
    });
  });

const completePreviouslyConnectedMailboxSession = (connectSession: StoredConnectSession) =>
  Effect.gen(function* () {
    if (connectSession.mailboxId === null) {
      return yield* Effect.fail(connectSessionNotFound(connectSession.id));
    }

    const mailbox = yield* getMailboxOrFail(connectSession.mailboxId, {
      workspaceId: connectSession.workspaceId,
    });

    if (mailbox.initializedAt === null) {
      const dispatcher = yield* MailboxSyncDispatcher;

      yield* dispatcher.dispatchMailboxSync(mailbox.id);
    }

    return {
      mailbox,
      redirectUrl: connectSession.redirectUrl,
      created: false,
    } as const;
  });

export const completeGmailMailboxConnectSession = (
  connectSessionId: string,
  code: string,
  connectBaseUrl: string,
) =>
  Effect.gen(function* () {
    const connectSession = yield* getConnectSessionOrFail(connectSessionId);

    if (connectSession.completedAt !== null) {
      return yield* completePreviouslyConnectedMailboxSession(connectSession);
    }

    const completedAt = new Date().toISOString();

    if (isConnectSessionExpired(connectSession, completedAt)) {
      return yield* Effect.fail(connectSessionExpired(connectSessionId));
    }

    const mailboxConnectProvider = yield* MailboxConnectProvider;
    const connectSessionStore = yield* MailboxConnectSessionStore;
    const dispatcher = yield* MailboxSyncDispatcher;
    const authorization = yield* mailboxConnectProvider.completeAuthorization({
      code,
      codeVerifier: connectSession.codeVerifier,
      connectSessionId: connectSession.id,
      redirectUri: buildGmailConnectRedirectUri(connectBaseUrl),
    });
    const completedSession = yield* connectSessionStore.completeConnectSession({
      connectSessionId: connectSession.id,
      connectedAt: completedAt,
      providerAccountEmail: authorization.providerAccountEmail,
      refreshToken: authorization.refreshToken,
    });

    if (completedSession.created) {
      yield* dispatcher.dispatchMailboxSync(completedSession.mailbox.id);
    }

    return completedSession;
  });
