import { Effect, Option } from "effect";

import {
  invalidApiKey,
  mailboxNotFound,
  messageNotFound,
  threadNotFound,
  webhookEndpointNotFound,
} from "./problems.js";
import {
  MailboxCatalog,
  MailboxObservabilityCatalog,
  MailboxQueryCatalog,
  WebhookEndpointCatalog,
  WorkspaceApiKeyStore,
} from "./services.js";

export const authenticateWorkspaceApiKeyOrFail = (apiKey: string) =>
  Effect.gen(function* () {
    const workspaceApiKeyStore = yield* WorkspaceApiKeyStore;
    const workspace = yield* workspaceApiKeyStore.getWorkspaceForApiKey(apiKey);

    return yield* Option.match(workspace, {
      onNone: () => Effect.fail(invalidApiKey()),
      onSome: (value) => Effect.succeed(value),
    });
  });

export const getMailboxById = (
  mailboxId: string,
  options: Readonly<{
    workspaceId?: string;
  }> = {},
) =>
  Effect.gen(function* () {
    const catalog = yield* MailboxCatalog;

    return yield* catalog.getMailbox(mailboxId, options);
  });

export const getMailboxOrFail = (
  mailboxId: string,
  options: Readonly<{
    workspaceId?: string;
  }> = {},
) =>
  getMailboxById(mailboxId, options).pipe(
    Effect.flatMap((mailbox) =>
      Option.match(mailbox, {
        onNone: () => Effect.fail(mailboxNotFound(mailboxId)),
        onSome: (value) => Effect.succeed(value),
      }),
    ),
  );

export const getWebhookEndpointById = (
  webhookEndpointId: string,
  options: Readonly<{
    workspaceId?: string;
  }> = {},
) =>
  Effect.gen(function* () {
    const catalog = yield* WebhookEndpointCatalog;

    return yield* catalog.getWebhookEndpoint(webhookEndpointId, options);
  });

export const getWebhookEndpointOrFail = (
  webhookEndpointId: string,
  options: Readonly<{
    workspaceId?: string;
  }> = {},
) =>
  getWebhookEndpointById(webhookEndpointId, options).pipe(
    Effect.flatMap((webhookEndpoint) =>
      Option.match(webhookEndpoint, {
        onNone: () => Effect.fail(webhookEndpointNotFound(webhookEndpointId)),
        onSome: (value) => Effect.succeed(value),
      }),
    ),
  );

export const listMailboxMessages = (
  mailboxId: string,
  options: Readonly<{
    cursor?: string | null;
    limit: number;
    workspaceId?: string;
  }>,
) =>
  Effect.gen(function* () {
    yield* getMailboxOrFail(
      mailboxId,
      options.workspaceId === undefined ? {} : { workspaceId: options.workspaceId },
    );
    const queryCatalog = yield* MailboxQueryCatalog;

    return yield* queryCatalog.listMessages({
      mailboxId,
      cursor: options.cursor ?? null,
      limit: options.limit,
    });
  });

export const getMessageOrFail = (
  messageId: string,
  options: Readonly<{
    workspaceId?: string;
  }> = {},
) =>
  Effect.gen(function* () {
    const queryCatalog = yield* MailboxQueryCatalog;
    const message = yield* queryCatalog.getMessage(messageId, options);

    return yield* Option.match(message, {
      onNone: () => Effect.fail(messageNotFound(messageId)),
      onSome: (value) => Effect.succeed(value),
    });
  });

export const listMailboxThreads = (
  mailboxId: string,
  options: Readonly<{
    cursor?: string | null;
    limit: number;
    workspaceId?: string;
  }>,
) =>
  Effect.gen(function* () {
    yield* getMailboxOrFail(
      mailboxId,
      options.workspaceId === undefined ? {} : { workspaceId: options.workspaceId },
    );
    const queryCatalog = yield* MailboxQueryCatalog;

    return yield* queryCatalog.listThreads({
      mailboxId,
      cursor: options.cursor ?? null,
      limit: options.limit,
    });
  });

export const listMailboxSyncRuns = (
  mailboxId: string,
  options: Readonly<{
    cursor?: string | null;
    limit: number;
    workspaceId?: string;
  }>,
) =>
  Effect.gen(function* () {
    yield* getMailboxOrFail(
      mailboxId,
      options.workspaceId === undefined ? {} : { workspaceId: options.workspaceId },
    );
    const observabilityCatalog = yield* MailboxObservabilityCatalog;

    return yield* observabilityCatalog.listSyncRuns({
      mailboxId,
      cursor: options.cursor ?? null,
      limit: options.limit,
    });
  });

export const getMailboxObservability = (
  mailboxId: string,
  options: Readonly<{
    observedAt?: string;
    workspaceId?: string;
  }> = {},
) =>
  Effect.gen(function* () {
    yield* getMailboxOrFail(
      mailboxId,
      options.workspaceId === undefined ? {} : { workspaceId: options.workspaceId },
    );
    const observabilityCatalog = yield* MailboxObservabilityCatalog;

    return yield* observabilityCatalog.getMailboxObservability({
      mailboxId,
      observedAt: options.observedAt ?? new Date().toISOString(),
    });
  });

export const getThreadOrFail = (
  threadId: string,
  options: Readonly<{
    workspaceId?: string;
  }> = {},
) =>
  Effect.gen(function* () {
    const queryCatalog = yield* MailboxQueryCatalog;
    const thread = yield* queryCatalog.getThread(threadId, options);

    return yield* Option.match(thread, {
      onNone: () => Effect.fail(threadNotFound(threadId)),
      onSome: (value) => Effect.succeed(value),
    });
  });
