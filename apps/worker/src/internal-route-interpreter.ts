import type { InternalMessageDecodeResult, ProblemDetails } from "@mailmon/core";
import { Context, ManagedRuntime } from "effect";

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
  readonly invalidRequest: (error: string) => Response | Promise<Response>;
  readonly precondition?: () => Response | null;
  readonly problemStatus?: (problem: ProblemDetails) => number;
  readonly selectProcessor: (
    processors: WorkerHttpProcessorHandlers,
  ) => (request: TRequest) => Promise<TResult>;
  readonly successStatus?: number;
}

export type WorkerHttpServerRuntime = Pick<ManagedRuntime.ManagedRuntime<any, any>, "runPromise">;

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

const readJsonRequest = async (request: JsonRequestReader) => {
  const body = await request.text();

  if (body.length === 0) {
    return null;
  }

  return JSON.parse(body) as unknown;
};

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

const getWorkerHttpProcessors = (
  runtime: WorkerHttpServerRuntime,
): Promise<WorkerHttpProcessorHandlers> => {
  return runtime.runPromise(WorkerHttpProcessors.asEffect());
};

export const interpretInternalRoute =
  <TRequest, TResult>(
    spec: InternalRouteSpec<TRequest, TResult>,
    runtime: WorkerHttpServerRuntime,
  ) =>
  async (request: JsonRequestReader) => {
    const precondition = spec.precondition?.() ?? null;

    if (precondition !== null) {
      return precondition;
    }

    try {
      const payload = await readJsonRequest(request);
      const parsed = spec.decode(payload);

      if ("error" in parsed) {
        return spec.invalidRequest(parsed.error);
      }

      const processors = await getWorkerHttpProcessors(runtime);
      const result = await spec.selectProcessor(processors)(parsed.value);

      return createJsonResponse(result, spec.successStatus ?? 200);
    } catch (error) {
      if (isProblemDetails(error)) {
        return createJsonResponse(error, spec.problemStatus?.(error) ?? error.status);
      }

      console.error(spec.internalErrorDetail, error);
      return createWorkerInternalErrorResponse(spec.internalErrorDetail);
    }
  };
