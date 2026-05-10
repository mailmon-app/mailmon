import { createHmac } from "node:crypto";

import { Args, Command, Options } from "@effect/cli";
import { CliConfig as MailmonCliConfig } from "@mailmon/config";
import {
  type ControlJobKind,
  createReplay,
  dispatchReplays,
  dispatchMailboxSync,
  runWebhookDelivery,
  WebhookDeliveryScheduler,
  WebhookDeliverySender,
  WebhookDeliveryStore,
  type MailboxEventEnvelope,
  type PreparedWebhookDelivery,
  type WebhookDeliverySendFailure,
} from "@mailmon/core";
import {
  auditGmailMailboxCredentials,
  createCorePersistenceLayer,
  createDatabaseLayer,
  createWebhookDeliveryStoreLayer,
  createWorkspaceApiKeyForOperators,
  createWorkspaceForOperators,
  ensureLocalReplayWebhookEndpoint,
  rewrapGmailMailboxCredentials,
  revokeWorkspaceApiKeyForOperators,
  type CreatedWorkspaceApiKeyOperatorResult,
  type CreatedWorkspaceOperatorResult,
  type GmailMailboxCredentialAuditSummary,
  type GmailMailboxCredentialRewrapResult,
  type RevokedWorkspaceApiKeyOperatorResult,
} from "@mailmon/db";
import { createAesGcmGmailRefreshTokenCipherLayer } from "@mailmon/gmail";
import { createLocalAsyncTransportLayer } from "@mailmon/queue";
import { Console, Data, Effect, Layer, ManagedRuntime, Option, Schema } from "effect";

class CliError extends Data.TaggedError("CliError")<{
  readonly message: string;
}> {}

const forwardToOption = Options.text("forward-to").pipe(
  Options.optional,
  Options.withDescription("Forward webhook deliveries to a local HTTP endpoint"),
);
const requiredForwardToOption = Options.text("forward-to").pipe(
  Options.withDescription("Forward webhook events to a local HTTP endpoint"),
);
const mailboxOption = Options.text("mailbox").pipe(
  Options.withDescription("Mailbox ID to replay events for"),
);
const lastOption = Options.text("last").pipe(
  Options.withDescription("Replay events from the last duration, for example 15m, 1h, or 7d"),
);
const testSigningSecretOption = Options.text("test-signing-secret").pipe(
  Options.withDefault("whsec_mailmon_cli_test"),
  Options.withDescription("Signing secret used for local test webhook signatures"),
);
const pollIntervalMsOption = Options.integer("poll-interval-ms").pipe(
  Options.withDefault(1000),
  Options.withDescription("Polling interval for local webhook deliveries"),
);
const workspaceIdOption = Options.text("workspace-id").pipe(
  Options.optional,
  Options.withDescription("Workspace ID"),
);
const requiredWorkspaceIdOption = Options.text("workspace-id").pipe(
  Options.withDescription("Workspace ID"),
);
const keyPrefixOption = Options.text("prefix").pipe(
  Options.withDefault("mm_test_"),
  Options.withDescription("API key prefix: mm_test_ or mm_live_"),
);
const apiKeyIdOption = Options.text("key-id").pipe(
  Options.optional,
  Options.withDescription("Workspace API key ID to revoke"),
);
const apiKeyOption = Options.text("api-key").pipe(
  Options.optional,
  Options.withDescription("Raw workspace API key to revoke"),
);
const markUnreadableReconnectRequiredOption = Options.boolean(
  "mark-unreadable-reconnect-required",
).pipe(
  Options.withDescription(
    "Move credentials that cannot be decrypted into reconnect_required instead of only reporting them",
  ),
);

const controlJobKinds = [
  "renew_watches",
  "dispatch_replays",
  "repair_mailboxes",
  "recover_stuck_syncs",
  "recover_webhook_deliveries",
  "cleanup",
] as const satisfies ReadonlyArray<ControlJobKind>;

const createCredentialOperatorRuntime = (config: {
  readonly databaseUrl: string;
  readonly gmailRefreshTokenEncryptionKey: string;
  readonly gmailRefreshTokenEncryptionKeyId: string;
  readonly gmailRefreshTokenPreviousEncryptionKeys: ReadonlyArray<{
    readonly encryptionKey: string;
    readonly keyId: string;
  }>;
  readonly nodeEnv: string;
}) => {
  const gmailRefreshTokenCipherLayer = createAesGcmGmailRefreshTokenCipherLayer({
    activeKeyId: config.gmailRefreshTokenEncryptionKeyId,
    allowPlaintextFallback: config.nodeEnv !== "production",
    decryptionKeys: config.gmailRefreshTokenPreviousEncryptionKeys,
    encryptionKey: config.gmailRefreshTokenEncryptionKey,
  });

  return ManagedRuntime.make(
    Layer.mergeAll(createDatabaseLayer(config.databaseUrl), gmailRefreshTokenCipherLayer),
  );
};

export const formatGmailCredentialAuditSummary = (summary: GmailMailboxCredentialAuditSummary) => {
  return [
    `gmail credentials: ${summary.total} total`,
    `${summary.encryptedCurrent} current`,
    `${summary.encryptedRewrapRequired} need rewrap`,
    `${summary.plaintext} plaintext`,
    `${summary.unreadable} unreadable`,
  ].join(", ");
};

export const formatGmailCredentialRewrapSummary = (summary: GmailMailboxCredentialRewrapResult) => {
  return [
    `gmail credential rewrap: ${summary.total} total`,
    `${summary.rewrapped} rewrapped`,
    `${summary.alreadyCurrent} already current`,
    `${summary.markedReconnectRequired} marked reconnect_required`,
    `${summary.unreadable} unreadable`,
    `${summary.staleSkipped} stale skipped`,
  ].join(", ");
};

export const formatCreatedWorkspace = (result: CreatedWorkspaceOperatorResult) => {
  return result.created
    ? `created workspace ${result.workspaceId}`
    : `workspace ${result.workspaceId} already exists`;
};

export const formatCreatedWorkspaceApiKey = (result: CreatedWorkspaceApiKeyOperatorResult) => {
  return [
    `created workspace API key ${result.apiKeyId} for ${result.workspaceId}`,
    `prefix: ${result.keyPrefix}`,
    `api_key: ${result.apiKey}`,
  ].join("\n");
};

export const formatRevokedWorkspaceApiKey = (result: RevokedWorkspaceApiKeyOperatorResult) => {
  if (!result.revoked) {
    return result.apiKeyId === null
      ? "workspace API key was not found or was already revoked"
      : `workspace API key ${result.apiKeyId} was not found or was already revoked`;
  }

  return `revoked workspace API key ${result.apiKeyId}`;
};

export const parseLastDurationMs = (last: string) => {
  const match = /^(\d+)(s|m|h|d)$/.exec(last.trim());

  if (match === null) {
    throw new Error("Duration must use s, m, h, or d suffix, for example 30m or 2h.");
  }

  const amount = Number.parseInt(match[1] ?? "", 10);
  const unit = match[2];
  const multiplier =
    unit === "s" ? 1000 : unit === "m" ? 60_000 : unit === "h" ? 3_600_000 : 86_400_000;

  return amount * multiplier;
};

const encodeJsonString = (value: unknown) => Schema.encodeUnknownSync(Schema.parseJson())(value);

const createWebhookDeliverySignature = (
  signingSecret: string,
  timestampSeconds: string,
  body: string,
) => {
  const signature = createHmac("sha256", signingSecret)
    .update(`${timestampSeconds}.${body}`)
    .digest("hex");

  return `t=${timestampSeconds},v1=${signature}`;
};

const classifyWebhookDeliveryFailure = (error: unknown): WebhookDeliverySendFailure => {
  if (error instanceof Error && error.name === "AbortError") {
    return {
      code: "webhook_delivery_timeout",
      message: "Webhook delivery timed out before the local endpoint responded.",
      retryable: true,
    };
  }

  return {
    code: "webhook_delivery_transport_error",
    message: error instanceof Error ? error.message : "Webhook delivery failed before a response.",
    retryable: true,
  };
};

const sendLocalWebhookEvent = (params: {
  readonly attemptCount: number;
  readonly deliveryId: string;
  readonly event: MailboxEventEnvelope;
  readonly forwardTo: string;
  readonly signingSecret: string;
  readonly attemptedAt?: string;
}) =>
  Effect.tryPromise({
    catch: classifyWebhookDeliveryFailure,
    try: async () => {
      const attemptedAt = params.attemptedAt ?? new Date().toISOString();
      const body = encodeJsonString(params.event);
      const timestampSeconds = String(Math.floor(Date.parse(attemptedAt) / 1000));
      const response = await globalThis.fetch(params.forwardTo, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "user-agent": "mailmon-cli/phase-8",
          "x-mailmon-attempt": String(params.attemptCount),
          "x-mailmon-delivery-id": params.deliveryId,
          "x-mailmon-event-id": params.event.id,
          "x-mailmon-signature": createWebhookDeliverySignature(
            params.signingSecret,
            timestampSeconds,
            body,
          ),
        },
        body,
      });

      return {
        statusCode: response.status,
      };
    },
  });

const createLocalForwardingWebhookDeliverySenderLayer = (options: {
  readonly forwardTo: string;
  readonly testSigningSecret: string;
}) =>
  Layer.succeed(WebhookDeliverySender, {
    send: (delivery: PreparedWebhookDelivery, attemptedAt: string) =>
      sendLocalWebhookEvent({
        attemptCount: delivery.attemptCount,
        attemptedAt,
        deliveryId: delivery.deliveryId,
        event: delivery.event,
        forwardTo: options.forwardTo,
        signingSecret: options.testSigningSecret,
      }),
  });

const noopWebhookDeliverySchedulerLayer = Layer.succeed(WebhookDeliveryScheduler, {
  scheduleWebhookDelivery: () => Effect.void,
});

export const getListenMessage = (options: { readonly forwardTo: Option.Option<string> }) =>
  Effect.gen(function* () {
    const config = yield* MailmonCliConfig;
    const transportDescription =
      config.asyncTransportMode === "legacy_bullmq"
        ? "legacy BullMQ async transport"
        : `${config.asyncTransportMode} async transport`;

    return Option.match(options.forwardTo, {
      onNone: () => `listening for local events using ${transportDescription}`,
      onSome: (forwardTo) =>
        `listening for local events using ${transportDescription} and forwarding webhook deliveries to ${forwardTo}`,
    });
  });

const requireDatabaseUrl = (databaseUrl: string | null, action: string) => {
  if (databaseUrl === null) {
    return Effect.fail(
      new CliError({ message: `DATABASE_URL is required to ${action} from the CLI` }),
    );
  }

  return Effect.succeed(databaseUrl);
};

const runListen = (options: {
  readonly forwardTo: Option.Option<string>;
  readonly pollIntervalMs: number;
  readonly testSigningSecret: string;
}) =>
  Effect.gen(function* () {
    const message = yield* getListenMessage(options);
    yield* Console.log(message);

    const forwardTo = Option.getOrNull(options.forwardTo);

    if (forwardTo === null) {
      return yield* Console.log(
        "pass --forward-to to process and forward local webhook deliveries",
      );
    }

    const config = yield* MailmonCliConfig;
    const databaseUrl = yield* requireDatabaseUrl(
      config.databaseUrl,
      "listen for local webhook deliveries",
    );
    const runtime = yield* Effect.acquireRelease(
      Effect.sync(() =>
        ManagedRuntime.make(
          Layer.mergeAll(
            createWebhookDeliveryStoreLayer.pipe(Layer.provide(createDatabaseLayer(databaseUrl))),
            createLocalForwardingWebhookDeliverySenderLayer({
              forwardTo,
              testSigningSecret: options.testSigningSecret,
            }),
            noopWebhookDeliverySchedulerLayer,
          ),
        ),
      ),
      (managedRuntime) => Effect.promise(() => managedRuntime.dispose()),
    );

    yield* Console.log(
      `forwarding due webhook deliveries to ${forwardTo} with test signatures; press Ctrl+C to stop`,
    );

    return yield* Effect.tryPromise({
      try: async () => {
        for (;;) {
          const dueDeliveries = await runtime.runPromise(
            Effect.gen(function* () {
              const store = yield* WebhookDeliveryStore;
              const schedules = yield* store.listWebhookDeliveryRecoverySchedules(
                new Date().toISOString(),
              );
              const nowMs = Date.now();

              return schedules.filter((schedule) => Date.parse(schedule.notBefore) <= nowMs);
            }),
          );

          for (const delivery of dueDeliveries) {
            const result = await runtime.runPromise(runWebhookDelivery(delivery.deliveryId));
            console.log(
              `delivery ${result.deliveryId}: ${result.status}${
                result.nextAttemptAt === null ? "" : `, next_attempt_at=${result.nextAttemptAt}`
              }`,
            );
          }

          await new Promise((resolve) => {
            globalThis.setTimeout(resolve, options.pollIntervalMs);
          });
        }
      },
      catch: (error) =>
        new CliError({
          message:
            error instanceof Error
              ? error.message
              : "Listening for local webhook deliveries failed.",
        }),
    });
  });

const runReplay = (options: {
  readonly forwardTo: string;
  readonly last: string;
  readonly mailbox: string;
  readonly testSigningSecret: string;
}) =>
  Effect.gen(function* () {
    const config = yield* MailmonCliConfig;
    const databaseUrl = yield* requireDatabaseUrl(config.databaseUrl, "replay mailbox events");
    if (config.gmailRefreshTokenEncryptionKey === null) {
      return yield* new CliError({
        message: "MAILMON_GMAIL_REFRESH_TOKEN_ENCRYPTION_KEY is required to replay mailbox events.",
      });
    }
    const endTime = new Date().toISOString();
    const startTime = new Date(
      Date.parse(endTime) - parseLastDurationMs(options.last),
    ).toISOString();
    const endpoint = yield* ensureLocalReplayWebhookEndpoint({
      connectionString: databaseUrl,
      forwardTo: options.forwardTo,
      mailboxId: options.mailbox,
      signingSecret: options.testSigningSecret,
    });
    const scheduledDeliveries: Array<{ deliveryId: string; notBefore: string }> = [];
    const gmailRefreshTokenCipherLayer = createAesGcmGmailRefreshTokenCipherLayer({
      activeKeyId: config.gmailRefreshTokenEncryptionKeyId,
      allowPlaintextFallback: config.nodeEnv !== "production",
      decryptionKeys: config.gmailRefreshTokenPreviousEncryptionKeys,
      encryptionKey: config.gmailRefreshTokenEncryptionKey,
    });
    const runtime = ManagedRuntime.make(
      Layer.mergeAll(
        createCorePersistenceLayer(databaseUrl).pipe(Layer.provide(gmailRefreshTokenCipherLayer)),
        createLocalForwardingWebhookDeliverySenderLayer({
          forwardTo: options.forwardTo,
          testSigningSecret: options.testSigningSecret,
        }),
        Layer.succeed(WebhookDeliveryScheduler, {
          scheduleWebhookDelivery: (request) =>
            Effect.sync(() => {
              scheduledDeliveries.push(request);
            }),
        }),
      ),
    );
    yield* Effect.addFinalizer(() => Effect.promise(() => runtime.dispose()));

    const replay = yield* Effect.promise(() =>
      runtime.runPromise(
        createReplay(endpoint.workspaceId, {
          mailboxId: options.mailbox,
          webhookEndpointId: endpoint.webhookEndpointId,
          startTime,
          endTime,
        }),
      ),
    );
    const dispatchResult = yield* Effect.promise(() =>
      runtime.runPromise(dispatchReplays({ observedAt: endTime })),
    );

    for (const delivery of scheduledDeliveries) {
      const result = yield* Effect.promise(() =>
        runtime.runPromise(runWebhookDelivery(delivery.deliveryId)),
      );

      yield* Console.log(`replayed ${delivery.deliveryId}: ${result.status}`);
    }

    return yield* Console.log(
      `replay ${replay.id} completed: ${dispatchResult.eventsReplayed} mailbox events for ${options.mailbox}`,
    );
  }).pipe(Effect.scoped);

const parseApiKeyPrefix = (prefix: string): "mm_live_" | "mm_test_" => {
  if (prefix === "mm_live_" || prefix === "mm_test_") {
    return prefix;
  }

  throw new Error("API key prefix must be mm_live_ or mm_test_.");
};

const isControlJobKind = (kind: string): kind is ControlJobKind =>
  controlJobKinds.some((candidate) => candidate === kind);

export const parseControlJobKind = (kind: string): ControlJobKind => {
  if (isControlJobKind(kind)) {
    return kind;
  }

  throw new Error(`Control job kind must be one of: ${controlJobKinds.join(", ")}.`);
};

const runControlJobDispatch = (options: { readonly kind: string }) =>
  Effect.gen(function* () {
    const config = yield* MailmonCliConfig;

    if (config.asyncTransportMode !== "local") {
      yield* Console.error(
        `manual control-job dispatch is only supported against the local worker runtime; received ${config.asyncTransportMode}`,
      );
      return;
    }

    const kind = parseControlJobKind(options.kind);
    const workerBaseUrl = config.workerBaseUrl.endsWith("/")
      ? config.workerBaseUrl.slice(0, -1)
      : config.workerBaseUrl;
    const responseText = yield* Effect.tryPromise({
      catch: (error) =>
        new CliError({
          message:
            error instanceof Error
              ? error.message
              : `Failed to run control job ${kind} through the local worker runtime.`,
        }),
      try: async () => {
        const response = await globalThis.fetch(`${workerBaseUrl}/internal/control-jobs`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
          },
          body: encodeJsonString({ kind }),
        });
        const body = await response.text();

        if (!response.ok) {
          throw new Error(`Control job ${kind} failed with HTTP ${response.status}: ${body}`);
        }

        return body;
      },
    });

    yield* Console.log(responseText);
  });

const runAdminWorkspaceCreate = (options: { readonly workspaceId: Option.Option<string> }) =>
  Effect.gen(function* () {
    const config = yield* MailmonCliConfig;
    const databaseUrl = yield* requireDatabaseUrl(config.databaseUrl, "create workspaces");
    const workspaceId = Option.getOrUndefined(options.workspaceId);
    const result = yield* createWorkspaceForOperators({
      connectionString: databaseUrl,
      ...(workspaceId === undefined ? {} : { workspaceId }),
    });

    yield* Console.log(formatCreatedWorkspace(result));
  });

const runAdminKeyCreate = (options: { readonly prefix: string; readonly workspaceId: string }) =>
  Effect.gen(function* () {
    const config = yield* MailmonCliConfig;
    const databaseUrl = yield* requireDatabaseUrl(config.databaseUrl, "create workspace API keys");
    const result = yield* createWorkspaceApiKeyForOperators({
      connectionString: databaseUrl,
      keyPrefix: parseApiKeyPrefix(options.prefix),
      workspaceId: options.workspaceId,
    });

    yield* Console.log(formatCreatedWorkspaceApiKey(result));
  });

const runAdminKeyRevoke = (options: {
  readonly apiKey: Option.Option<string>;
  readonly keyId: Option.Option<string>;
}) =>
  Effect.gen(function* () {
    const config = yield* MailmonCliConfig;
    const databaseUrl = yield* requireDatabaseUrl(config.databaseUrl, "revoke workspace API keys");
    const apiKey = Option.getOrUndefined(options.apiKey);
    const apiKeyId = Option.getOrUndefined(options.keyId);
    const result = yield* revokeWorkspaceApiKeyForOperators({
      ...(apiKey === undefined ? {} : { apiKey }),
      ...(apiKeyId === undefined ? {} : { apiKeyId }),
      connectionString: databaseUrl,
    });

    yield* Console.log(formatRevokedWorkspaceApiKey(result));
  });

const runSyncMailbox = (options: { readonly mailboxId: string }) =>
  Effect.gen(function* () {
    const config = yield* MailmonCliConfig;

    if (config.asyncTransportMode !== "local") {
      yield* Console.error(
        `mailbox sync dispatch is only implemented for local async transport; received ${config.asyncTransportMode}`,
      );
      return;
    }

    if (config.databaseUrl === null) {
      yield* Console.error("DATABASE_URL is required to dispatch mailbox sync from the CLI");
      return;
    }

    if (config.gmailRefreshTokenEncryptionKey === null) {
      yield* Console.error(
        "MAILMON_GMAIL_REFRESH_TOKEN_ENCRYPTION_KEY is required to dispatch mailbox sync from the CLI",
      );
      return;
    }

    const databaseUrl = config.databaseUrl;
    const gmailRefreshTokenCipherLayer = createAesGcmGmailRefreshTokenCipherLayer({
      activeKeyId: config.gmailRefreshTokenEncryptionKeyId,
      allowPlaintextFallback: config.nodeEnv !== "production",
      decryptionKeys: config.gmailRefreshTokenPreviousEncryptionKeys,
      encryptionKey: config.gmailRefreshTokenEncryptionKey,
    });
    const dispatchRuntime = yield* Effect.acquireRelease(
      Effect.sync(() =>
        ManagedRuntime.make(
          Layer.mergeAll(
            createCorePersistenceLayer(databaseUrl).pipe(
              Layer.provide(gmailRefreshTokenCipherLayer),
            ),
            createLocalAsyncTransportLayer({
              workerBaseUrl: config.workerBaseUrl,
            }),
          ),
        ),
      ),
      (runtime) => Effect.promise(() => runtime.dispose()),
    );

    yield* Effect.promise(() => dispatchRuntime.runPromise(dispatchMailboxSync(options.mailboxId)));
    yield* Console.log(`dispatched mailbox sync for ${options.mailboxId}`);
  });

const runGmailCredentialsAudit = () =>
  Effect.gen(function* () {
    const config = yield* MailmonCliConfig;

    if (config.databaseUrl === null) {
      yield* Console.error("DATABASE_URL is required to audit Gmail credentials from the CLI");
      return;
    }

    if (config.gmailRefreshTokenEncryptionKey === null) {
      yield* Console.error(
        "MAILMON_GMAIL_REFRESH_TOKEN_ENCRYPTION_KEY is required to audit Gmail credentials from the CLI",
      );
      return;
    }

    const databaseUrl = config.databaseUrl;
    const gmailRefreshTokenEncryptionKey = config.gmailRefreshTokenEncryptionKey;
    const runtime = yield* Effect.acquireRelease(
      Effect.sync(() =>
        createCredentialOperatorRuntime({
          databaseUrl,
          gmailRefreshTokenEncryptionKey,
          gmailRefreshTokenEncryptionKeyId: config.gmailRefreshTokenEncryptionKeyId,
          gmailRefreshTokenPreviousEncryptionKeys: config.gmailRefreshTokenPreviousEncryptionKeys,
          nodeEnv: config.nodeEnv,
        }),
      ),
      (managedRuntime) => Effect.promise(() => managedRuntime.dispose()),
    );
    const report = yield* Effect.promise(() => runtime.runPromise(auditGmailMailboxCredentials()));

    yield* Console.log(formatGmailCredentialAuditSummary(report));
  });

const runGmailCredentialsRewrap = (options: {
  readonly markUnreadableReconnectRequired: boolean;
}) =>
  Effect.gen(function* () {
    const config = yield* MailmonCliConfig;

    if (config.databaseUrl === null) {
      yield* Console.error("DATABASE_URL is required to rewrap Gmail credentials from the CLI");
      return;
    }

    if (config.gmailRefreshTokenEncryptionKey === null) {
      yield* Console.error(
        "MAILMON_GMAIL_REFRESH_TOKEN_ENCRYPTION_KEY is required to rewrap Gmail credentials from the CLI",
      );
      return;
    }

    const databaseUrl = config.databaseUrl;
    const gmailRefreshTokenEncryptionKey = config.gmailRefreshTokenEncryptionKey;
    const runtime = yield* Effect.acquireRelease(
      Effect.sync(() =>
        createCredentialOperatorRuntime({
          databaseUrl,
          gmailRefreshTokenEncryptionKey,
          gmailRefreshTokenEncryptionKeyId: config.gmailRefreshTokenEncryptionKeyId,
          gmailRefreshTokenPreviousEncryptionKeys: config.gmailRefreshTokenPreviousEncryptionKeys,
          nodeEnv: config.nodeEnv,
        }),
      ),
      (managedRuntime) => Effect.promise(() => managedRuntime.dispose()),
    );
    const result = yield* Effect.promise(() =>
      runtime.runPromise(
        rewrapGmailMailboxCredentials({
          markUnreadableReconnectRequired: options.markUnreadableReconnectRequired,
        }),
      ),
    );

    yield* Console.log(formatGmailCredentialRewrapSummary(result));
  });

const listenCommand = Command.make(
  "listen",
  {
    forwardTo: forwardToOption,
    pollIntervalMs: pollIntervalMsOption,
    testSigningSecret: testSigningSecretOption,
  },
  (options) => runListen(options),
).pipe(Command.withDescription("Listen for local mailmon events"));

const replayCommand = Command.make(
  "replay",
  {
    forwardTo: requiredForwardToOption,
    last: lastOption,
    mailbox: mailboxOption,
    testSigningSecret: testSigningSecretOption,
  },
  (options) => runReplay(options),
).pipe(Command.withDescription("Replay stored mailbox events into a local endpoint"));

const syncMailboxCommand = Command.make(
  "sync-mailbox",
  {
    mailboxId: Args.text({
      name: "mailbox-id",
    }),
  },
  (options) => runSyncMailbox(options),
).pipe(Command.withDescription("Dispatch mailbox sync through the local worker runtime"));

const controlJobCommand = Command.make(
  "control-job",
  {
    kind: Args.text({
      name: "kind",
    }),
  },
  (options) => runControlJobDispatch(options),
).pipe(Command.withDescription("Run a control job through the local worker runtime"));

const gmailCredentialsAuditCommand = Command.make("audit", {}, () =>
  runGmailCredentialsAudit(),
).pipe(Command.withDescription("Audit stored Gmail refresh-token credential envelopes"));

const gmailCredentialsRewrapCommand = Command.make(
  "rewrap",
  {
    markUnreadableReconnectRequired: markUnreadableReconnectRequiredOption,
  },
  (options) => runGmailCredentialsRewrap(options),
).pipe(Command.withDescription("Re-encrypt Gmail refresh-token credentials with the active key"));

const gmailCredentialsCommand = Command.make("gmail-credentials", {}).pipe(
  Command.withDescription("Operate on persisted Gmail refresh-token credentials"),
  Command.withSubcommands([gmailCredentialsAuditCommand, gmailCredentialsRewrapCommand]),
);

const adminWorkspaceCreateCommand = Command.make(
  "create",
  {
    workspaceId: workspaceIdOption,
  },
  (options) => runAdminWorkspaceCreate(options),
).pipe(Command.withDescription("Create a Workspace"));

const adminWorkspaceCommand = Command.make("workspace", {}).pipe(
  Command.withDescription("Manage Workspaces"),
  Command.withSubcommands([adminWorkspaceCreateCommand]),
);

const adminKeysCreateCommand = Command.make(
  "create",
  {
    prefix: keyPrefixOption,
    workspaceId: requiredWorkspaceIdOption,
  },
  (options) => runAdminKeyCreate(options),
).pipe(Command.withDescription("Create a Workspace API key and print the raw key once"));

const adminKeysRevokeCommand = Command.make(
  "revoke",
  {
    apiKey: apiKeyOption,
    keyId: apiKeyIdOption,
  },
  (options) => runAdminKeyRevoke(options),
).pipe(Command.withDescription("Revoke a Workspace API key"));

const adminKeysCommand = Command.make("keys", {}).pipe(
  Command.withDescription("Manage Workspace API keys"),
  Command.withSubcommands([adminKeysCreateCommand, adminKeysRevokeCommand]),
);

const adminCommand = Command.make("admin", {}).pipe(
  Command.withDescription("Back-office operator commands"),
  Command.withSubcommands([adminWorkspaceCommand, adminKeysCommand]),
);

export const appCommand = Command.make("mailmon", {}).pipe(
  Command.withDescription("Local mailmon development CLI"),
  Command.withSubcommands([
    listenCommand,
    replayCommand,
    syncMailboxCommand,
    controlJobCommand,
    adminCommand,
    gmailCredentialsCommand,
  ]),
);
