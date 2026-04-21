import { Args, Command, Options } from "@effect/cli";
import { CliConfig as MailmonCliConfig } from "@mailmon/config";
import { dispatchMailboxSync } from "@mailmon/core";
import {
  auditGmailMailboxCredentials,
  createCorePersistenceLayer,
  createDatabaseLayer,
  rewrapGmailMailboxCredentials,
  type GmailMailboxCredentialAuditSummary,
  type GmailMailboxCredentialRewrapResult,
} from "@mailmon/db";
import { createAesGcmGmailRefreshTokenCipherLayer } from "@mailmon/gmail";
import { createLocalAsyncTransportLayer } from "@mailmon/queue";
import { Console, Effect, Layer, ManagedRuntime, Option } from "effect";

const forwardToOption = Options.text("forward-to").pipe(
  Options.optional,
  Options.withDescription("Forward webhook deliveries to a local HTTP endpoint"),
);
const markUnreadableReconnectRequiredOption = Options.boolean(
  "mark-unreadable-reconnect-required",
).pipe(
  Options.withDescription(
    "Move credentials that cannot be decrypted into reconnect_required instead of only reporting them",
  ),
);

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

const runListen = (options: { readonly forwardTo: Option.Option<string> }) =>
  Effect.gen(function* () {
    const message = yield* getListenMessage(options);
    yield* Console.log(message);
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

const listenCommand = Command.make("listen", { forwardTo: forwardToOption }, (options) =>
  runListen(options),
).pipe(Command.withDescription("Listen for local mailmon events"));

const syncMailboxCommand = Command.make(
  "sync-mailbox",
  {
    mailboxId: Args.text({
      name: "mailbox-id",
    }),
  },
  (options) => runSyncMailbox(options),
).pipe(Command.withDescription("Dispatch mailbox sync through the local worker runtime"));

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

export const appCommand = Command.make("mailmon", {}).pipe(
  Command.withDescription("Local mailmon development CLI"),
  Command.withSubcommands([listenCommand, syncMailboxCommand, gmailCredentialsCommand]),
);
