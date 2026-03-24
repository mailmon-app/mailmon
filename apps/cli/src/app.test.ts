import { describe, expect, it } from "@effect/vitest";
import { CliConfig } from "@mailmon/config";
import { Effect, Option } from "effect";

import { getListenMessage } from "./app.js";

describe("getListenMessage", () => {
  it.effect("renders the redis endpoint from config", () =>
    Effect.gen(function* () {
      const message = yield* getListenMessage({ forwardTo: Option.none() });

      expect(message).toBe("listening for local events with redis at redis://localhost:6379");
    }).pipe(Effect.provide(CliConfig.testLayer)),
  );

  it.effect("includes the forwarding target when requested", () =>
    Effect.gen(function* () {
      const message = yield* getListenMessage({
        forwardTo: Option.some("http://localhost:3000/webhooks/mailmon"),
      });

      expect(message).toContain("http://localhost:3000/webhooks/mailmon");
    }).pipe(Effect.provide(CliConfig.testLayer)),
  );
});
