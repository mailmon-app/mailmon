#!/usr/bin/env node
import { Command } from "@effect/cli";
import { NodeContext, NodeRuntime } from "@effect/platform-node";
import { CliConfig } from "@mailmon/config";
import { Effect, Layer } from "effect";

import { appCommand } from "./app.js";

const cli = Command.run(appCommand, {
  name: "mailmon",
  version: "0.0.0",
});

const runtimeLayer = Layer.mergeAll(CliConfig.layer, NodeContext.layer);

cli(process.argv).pipe(Effect.provide(runtimeLayer), NodeRuntime.runMain);
