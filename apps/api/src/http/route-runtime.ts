import { type ProblemDetails, type WorkspaceApiKeyIdentity } from "@mailmon/core";
import { Effect } from "effect";
import type { Context, HonoRequest } from "hono";

import {
  authenticateRequestEffect,
  createProblemResponse,
  toHandlerResult,
  type ApiServerRuntime,
} from "./handlers.js";

export type SuccessStatus = 200 | 201;

export type AuthenticatedRouteRequest = {
  readonly context: Context;
  readonly workspace: WorkspaceApiKeyIdentity;
  readonly origin: string;
};

export type AuthenticatedRouteOptions<A, B extends {}> = {
  readonly successStatus?: SuccessStatus;
  readonly mapResponse?: (value: A) => B;
};

export const getRequestOrigin = (req: HonoRequest) => {
  const forwardedProto = req.header("x-forwarded-proto");
  const forwardedHost = req.header("x-forwarded-host") || req.header("host");
  if (forwardedProto && forwardedHost) {
    return `${forwardedProto}://${forwardedHost}`;
  }
  return new URL(req.url).origin;
};

type ValidatedJsonRequest<T> = HonoRequest & {
  readonly valid: (target: "json") => T;
};

type ValidatedQueryRequest<T> = HonoRequest & {
  readonly valid: (target: "query") => T;
};

// oxlint-disable-next-line typescript/no-unnecessary-type-parameters
export const validatedJson = <T>(context: Context): T => {
  // Hono has already run the validator; this helper restores the route-level type erased by the shared handler.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  return (context.req as ValidatedJsonRequest<T>).valid("json");
};

// oxlint-disable-next-line typescript/no-unnecessary-type-parameters
export const validatedQuery = <T>(context: Context): T => {
  // Hono has already run the validator; this helper restores the route-level type erased by the shared handler.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  return (context.req as ValidatedQueryRequest<T>).valid("query");
};

export const pathParam = Effect.fn("api.pathParam")(function* (context: Context, name: string) {
  const value = context.req.param(name);

  if (value === undefined) {
    return yield* Effect.die(new Error(`Route path parameter ${name} is missing.`));
  }

  return value;
});

const runAuthenticatedRouteEffect = Effect.fn("api.runAuthenticatedRoute")(function* <
  A extends {},
  B extends {},
>(
  request: AuthenticatedRouteRequest,
  run: (request: AuthenticatedRouteRequest) => Effect.Effect<A, ProblemDetails, unknown>,
  options: AuthenticatedRouteOptions<A, B>,
) {
  const value = yield* run(request);
  const responseBody = options.mapResponse?.(value) ?? value;
  const successStatus = options.successStatus ?? 200;

  return successStatus === 200
    ? request.context.json(responseBody)
    : request.context.json(responseBody, successStatus);
});

const handleAuthenticatedRouteEffect = Effect.fn("api.handleAuthenticatedRoute")(function* <
  A extends {},
  B extends {},
>(
  context: Context,
  run: (request: AuthenticatedRouteRequest) => Effect.Effect<A, ProblemDetails, unknown>,
  options: AuthenticatedRouteOptions<A, B>,
) {
  const workspace = yield* authenticateRequestEffect(context.req.header("authorization"));

  return yield* runAuthenticatedRouteEffect(
    {
      context,
      workspace,
      origin: getRequestOrigin(context.req),
    },
    run,
    options,
  );
});

export const createAuthenticatedRouteHandler = <A extends {}, B extends {} = A>(
  runtime: ApiServerRuntime,
  run: (request: AuthenticatedRouteRequest) => Effect.Effect<A, ProblemDetails, unknown>,
  options: AuthenticatedRouteOptions<A, B> = {},
) => {
  return async (context: Context) => {
    return runtime.runPromise(
      handleAuthenticatedRouteEffect(context, run, options).pipe(
        toHandlerResult,
        Effect.map((result) => {
          if (result.tag === "failure") {
            return createProblemResponse(result.problem);
          }

          return result.value;
        }),
      ),
    );
  };
};
