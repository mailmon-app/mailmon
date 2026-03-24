import { describe, expect, it } from "@effect/vitest";
import { CliConfig } from "@mailmon/config";
import { Effect } from "effect";

import { getListenMessage } from "./app.js";

describe("getListenMessage", () => {
  it.effect("renders the redis endpoint from config", () =>
    Effect.gen(function* () {
      const message = yield* getListenMessage;

      expect(message).toBe("listening for local events with redis at redis://localhost:6379");
    }).pipe(Effect.provide(CliConfig.testLayer)),
  );
});
