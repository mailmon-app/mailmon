import {
  authenticateWorkspaceApiKeyOrFail,
  type ProblemDetails,
  type WorkspaceApiKeyIdentity,
} from "@mailmon/core";
import { Effect, ManagedRuntime } from "effect";

import { invalidRequest } from "./parsers.js";

export type ApiServerRuntime = Pick<ManagedRuntime.ManagedRuntime<any, any>, "runPromise">;

export type HandlerResult<A> =
  | { readonly tag: "success"; readonly value: A }
  | { readonly tag: "failure"; readonly problem: ProblemDetails };

export type AuthResult =
  | { readonly tag: "success"; readonly workspace: WorkspaceApiKeyIdentity }
  | { readonly tag: "failure"; readonly problem: ProblemDetails };

export const createProblemResponse = (problem: ProblemDetails): globalThis.Response => {
  return new Response(JSON.stringify(problem), {
    status: problem.status,
    headers: {
      "content-type": "application/json",
    },
  });
};

export const extractBearerApiKey = (authorizationHeader: string | undefined) => {
  if (authorizationHeader === undefined) {
    return null;
  }

  const [scheme, token] = authorizationHeader.split(/\s+/, 2);

  if (scheme?.toLowerCase() !== "bearer" || token === undefined || token.length === 0) {
    return null;
  }

  return token;
};

export const runProblemEffect = <A, E extends ProblemDetails, R>(
  runtime: ApiServerRuntime,
  effect: Effect.Effect<A, E, R>,
): Promise<HandlerResult<A>> => {
  return runtime.runPromise(toHandlerResult(effect));
};

export const toHandlerResult = <A, E extends ProblemDetails, R>(
  effect: Effect.Effect<A, E, R>,
): Effect.Effect<HandlerResult<A>, never, R> => {
  return effect.pipe(
    Effect.match({
      onFailure: (problem) => ({ tag: "failure" as const, problem }),
      onSuccess: (value) => ({ tag: "success" as const, value }),
    }),
  );
};

export const authenticateRequestEffect = Effect.fn("api.authenticateRequest")(function* (
  authorizationHeader: string | undefined,
) {
  const apiKey = extractBearerApiKey(authorizationHeader);

  if (apiKey === null) {
    return yield* Effect.fail(invalidRequest("Authorization must use Bearer <mailmon_api_key>."));
  }

  return yield* authenticateWorkspaceApiKeyOrFail(apiKey);
});

export const authenticateRequest = async (
  runtime: ApiServerRuntime,
  authorizationHeader: string | undefined,
): Promise<AuthResult> => {
  const result = await runProblemEffect(runtime, authenticateRequestEffect(authorizationHeader));

  if (result.tag === "failure") {
    return result;
  }

  return {
    tag: "success",
    workspace: result.value,
  };
};
