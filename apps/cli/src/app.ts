import { Args, Command, Options } from "@effect/cli";
import { CliConfig as MailmonCliConfig } from "@mailmon/config";
import { dispatchMailboxSync } from "@mailmon/core";
import { createCorePersistenceLayer } from "@mailmon/db";
import { createLocalAsyncTransportLayer } from "@mailmon/queue";
import { Console, Effect, Layer, ManagedRuntime, Option } from "effect";

const forwardToOption = Options.text("forward-to").pipe(
  Options.optional,
  Options.withDescription("Forward webhook deliveries to a local HTTP endpoint"),
);

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

    const databaseUrl = config.databaseUrl;
    const dispatchRuntime = yield* Effect.acquireRelease(
      Effect.sync(() =>
        ManagedRuntime.make(
          Layer.mergeAll(
            createCorePersistenceLayer(databaseUrl),
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

export const appCommand = Command.make("mailmon", {}).pipe(
  Command.withDescription("Local mailmon development CLI"),
  Command.withSubcommands([listenCommand, syncMailboxCommand]),
);
