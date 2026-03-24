import { Command, Options } from "@effect/cli";
import { CliConfig as MailmonCliConfig } from "@mailmon/config";
import { Console, Effect, Option } from "effect";

export interface ListenCommandOptions {
  readonly forwardTo: Option.Option<string>;
}

export const forwardToOption = Options.text("forward-to").pipe(
  Options.optional,
  Options.withDescription("Forward webhook deliveries to a local HTTP endpoint"),
);

export const getListenMessage = (options: ListenCommandOptions) =>
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

export const runListen = (options: ListenCommandOptions) =>
  Effect.gen(function* () {
    const message = yield* getListenMessage(options);
    yield* Console.log(message);
  });

export const listenCommand = Command.make("listen", { forwardTo: forwardToOption }, (options) =>
  runListen(options),
).pipe(Command.withDescription("Listen for local mailmon events"));

export const appCommand = Command.make("mailmon", {}).pipe(
  Command.withDescription("Local mailmon development CLI"),
  Command.withSubcommands([listenCommand]),
);
