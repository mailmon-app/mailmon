import { invalidApiKey, WorkspaceApiKeyStore } from "@mailmon/core";
import { Effect, Layer, ManagedRuntime, Option } from "effect";
import { describe, expect, it } from "vitest";

import {
  authenticateRequest,
  extractBearerApiKey,
  runProblemEffect,
  type ApiServerRuntime,
} from "./handlers.js";

const toApiServerRuntime = <R>(
  runtime: ManagedRuntime.ManagedRuntime<R, never>,
): ApiServerRuntime => {
  return {
    runPromise: <A, E>(effect: Effect.Effect<A, E, R>) => runtime.runPromise(effect),
  };
};

describe("extractBearerApiKey", () => {
  it("rejects missing or malformed authorization headers", () => {
    expect(extractBearerApiKey(undefined)).toBeNull();
    expect(extractBearerApiKey("Basic abc")).toBeNull();
    expect(extractBearerApiKey("Bearer")).toBeNull();
  });

  it("extracts a bearer API key", () => {
    expect(extractBearerApiKey("Bearer test-api-key")).toBe("test-api-key");
  });
});

describe("runProblemEffect", () => {
  it("maps effect failure to a problem result", async () => {
    const runtime = toApiServerRuntime(ManagedRuntime.make(Layer.empty));
    const problem = invalidApiKey();

    await expect(runProblemEffect(runtime, Effect.fail(problem))).resolves.toEqual({
      tag: "failure",
      problem,
    });
  });

  it("passes through successful effect values", async () => {
    const runtime = toApiServerRuntime(ManagedRuntime.make(Layer.empty));

    await expect(runProblemEffect(runtime, Effect.succeed({ ok: true }))).resolves.toEqual({
      tag: "success",
      value: { ok: true },
    });
  });
});

describe("authenticateRequest", () => {
  it("returns invalid_request for missing bearer key", async () => {
    const runtime = toApiServerRuntime(ManagedRuntime.make(Layer.empty));

    await expect(authenticateRequest(runtime, undefined)).resolves.toMatchObject({
      tag: "failure",
      problem: {
        code: "invalid_request",
        detail: "Authorization must use Bearer <mailmon_api_key>.",
      },
    });
  });

  it("authenticates workspace API keys through core", async () => {
    const runtime = toApiServerRuntime(
      ManagedRuntime.make(
        Layer.succeed(WorkspaceApiKeyStore, {
          getWorkspaceForApiKey: () => Effect.succeed(Option.some({ workspaceId: "ws_123" })),
        }),
      ),
    );

    await expect(authenticateRequest(runtime, "Bearer test-api-key")).resolves.toEqual({
      tag: "success",
      workspace: { workspaceId: "ws_123" },
    });
  });
});
