import type { InternalMessageDecodeResult, ProblemDetails } from "@mailmon/core";
import { Context, Data, Effect, ManagedRuntime, Schema } from "effect";

import type { WorkerHttpRuntimeOptions } from "./server.js";

export interface WorkerHttpProcessorHandlers {
  readonly processControlJob: WorkerHttpRuntimeOptions["processControlJob"];
  readonly processGmailPushNotification: WorkerHttpRuntimeOptions["processGmailPushNotification"];
  readonly processMailboxSyncDeadLetter: NonNullable<
    WorkerHttpRuntimeOptions["processMailboxSyncDeadLetter"]
  >;
  readonly processSyncJob: WorkerHttpRuntimeOptions["processSyncJob"];
  readonly processWebhookDelivery: WorkerHttpRuntimeOptions["processWebhookDelivery"];
}

export class WorkerHttpProcessors extends Context.Service<
  WorkerHttpProcessors,
  WorkerHttpProcessorHandlers
>()("@mailmon/worker/WorkerHttpProcessors") {}

interface JsonRequestReader {
  readonly text: () => Promise<string>;
}

export interface InternalRouteSpec<TRequest, TResult> {
  readonly decode: (payload: unknown) => InternalMessageDecodeResult<TRequest>;
  readonly internalErrorDetail: string;
  readonly invalidRequest: (
    error: string,
  ) => Effect.Effect<Response, never, any> | Response | Promise<Response>;
  readonly precondition?: () => Response | null;
  readonly problemStatus?: (problem: ProblemDetails) => number;
  readonly selectProcessor: (
    processors: WorkerHttpProcessorHandlers,
  ) => (request: TRequest) => Promise<TResult>;
  readonly successStatus?: number;
}

export type WorkerHttpServerRuntime = Pick<ManagedRuntime.ManagedRuntime<any, any>, "runPromise">;

class WorkerRouteUnknownError extends Data.TaggedError("WorkerRouteUnknownError")<{
  readonly error: unknown;
}> {}

export const createJsonResponse = (body: unknown, status: number): Response => {
  return new Response(JSON.stringify(body), {
    headers: {
      "content-type": "application/json",
    },
    status,
  });
};

const createWorkerInternalErrorResponse = (detail: string): Response => {
  return createJsonResponse(
    {
      code: "worker_internal_error",
      detail,
    },
    500,
  );
};

const readJsonRequest = (request: JsonRequestReader) =>
  Effect.tryPromise({
    catch: (error) => new WorkerRouteUnknownError({ error }),
    try: async () => {
      const body = await request.text();

      if (body.length === 0) {
        return null;
      }

      return body;
    },
  }).pipe(
    Effect.flatMap((body) =>
      body === null
        ? Effect.succeed(null)
        : Schema.decodeUnknownEffect(Schema.UnknownFromJsonString)(body),
    ),
  );

const isProblemDetails = (value: unknown): value is ProblemDetails => {
  return (
    typeof value === "object" &&
    value !== null &&
    "code" in value &&
    "detail" in value &&
    "status" in value &&
    typeof value.code === "string" &&
    typeof value.detail === "string" &&
    typeof value.status === "number"
  );
};

const responseFromMaybePromise = (response: Response | Promise<Response>) =>
  Effect.tryPromise({
    catch: (error) => new WorkerRouteUnknownError({ error }),
    try: () => Promise.resolve(response),
  });

const responseFromRouteResult = (
  response: Effect.Effect<Response, never, any> | Response | Promise<Response>,
) => (Effect.isEffect(response) ? response : responseFromMaybePromise(response));

const wrapRouteError = (error: unknown) =>
  isProblemDetails(error) ? error : new WorkerRouteUnknownError({ error });

const unwrapRouteError = (error: unknown) =>
  error instanceof WorkerRouteUnknownError ? error.error : error;

export const interpretInternalRouteEffect = Effect.fn("worker.interpretInternalRoute")(function* <
  TRequest,
  TResult,
>(spec: InternalRouteSpec<TRequest, TResult>, request: JsonRequestReader) {
  const precondition = spec.precondition?.() ?? null;

  if (precondition !== null) {
    return precondition;
  }

  return yield* Effect.gen(function* () {
    const payload = yield* readJsonRequest(request);
    const parsed = yield* Effect.try({
      catch: wrapRouteError,
      try: () => spec.decode(payload),
    });

    if ("error" in parsed) {
      return yield* responseFromRouteResult(spec.invalidRequest(parsed.error));
    }

    const processors = yield* WorkerHttpProcessors;
    const result = yield* Effect.tryPromise({
      catch: wrapRouteError,
      try: () => spec.selectProcessor(processors)(parsed.value),
    });

    return createJsonResponse(result, spec.successStatus ?? 200);
  }).pipe(
    Effect.catch((error: unknown) => {
      const routeError = unwrapRouteError(error);

      if (isProblemDetails(routeError)) {
        return Effect.succeed(
          createJsonResponse(routeError, spec.problemStatus?.(routeError) ?? routeError.status),
        );
      }

      return Effect.logError(spec.internalErrorDetail, routeError).pipe(
        Effect.map(() => createWorkerInternalErrorResponse(spec.internalErrorDetail)),
      );
    }),
  );
});

export const interpretInternalRoute =
  <TRequest, TResult>(
    spec: InternalRouteSpec<TRequest, TResult>,
    runtime: WorkerHttpServerRuntime,
  ) =>
  (request: JsonRequestReader) =>
    runtime.runPromise(interpretInternalRouteEffect(spec, request));
