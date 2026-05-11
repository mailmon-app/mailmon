#!/usr/bin/env node
import * as NodeRuntime from "@effect/platform-node/NodeRuntime";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { CliConfig } from "@mailmon/config";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Command from "effect/unstable/cli/Command";

import { appCommand } from "./app.js";

const MainLayer = Layer.mergeAll(CliConfig.layer, NodeServices.layer);

const main = Command.run(appCommand, {
  version: "0.0.0",
}).pipe(
  Effect.provide(MainLayer),
  Effect.scoped,
);

NodeRuntime.runMain(main);
