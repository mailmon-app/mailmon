import { Command } from "@effect/cli";
import { CliConfig as MailmonCliConfig } from "@mailmon/config";
import { Console, Effect } from "effect";

export const getListenMessage = Effect.gen(function* () {
  const config = yield* MailmonCliConfig;

  return `listening for local events with redis at ${config.redisUrl}`;
});

export const runListen = Effect.gen(function* () {
  const message = yield* getListenMessage;
  yield* Console.log(message);
});

export const listenCommand = Command.make("listen", {}, () => runListen).pipe(
  Command.withDescription("Listen for local mailmon events"),
);

export const appCommand = Command.make("mailmon", {}).pipe(
  Command.withDescription("Local mailmon development CLI"),
  Command.withSubcommands([listenCommand]),
);
