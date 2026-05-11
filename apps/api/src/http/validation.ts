import { Schema } from "effect";
import { loadVendor, validator as honoValidator } from "hono-openapi";
import type { ValidationTargets } from "hono/types";

import { createProblemResponse } from "./handlers.js";
import {
  INVALID_LIMIT_DETAIL,
  INVALID_WEBHOOK_EVENT_TYPES_DETAIL,
  INVALID_WEBHOOK_SUBSCRIPTION_BODY_DETAIL,
  MISSING_MAILBOX_QUERY_DETAIL,
  invalidRequest,
} from "./parsers.js";

type ValidationDetail = string | ((data: unknown, target: keyof ValidationTargets) => string);

type JsonSchemaTarget = "draft-07" | "draft-2020-12";
type JsonSchemaObject = Readonly<Record<string, unknown>>;
type EffectStandardSchemaWithJsonSchema = {
  readonly "~standard": {
    readonly jsonSchema: {
      readonly input: (options: Readonly<{ target: JsonSchemaTarget }>) => JsonSchemaObject;
    };
  };
};

const DEFAULT_JSON_SCHEMA_TARGET: JsonSchemaTarget = "draft-2020-12";

const isJsonSchemaTarget = (value: unknown): value is JsonSchemaTarget => {
  return value === "draft-07" || value === "draft-2020-12";
};

const hasEffectJsonSchema = (value: unknown): value is EffectStandardSchemaWithJsonSchema => {
  if (typeof value !== "object" || value === null || !("~standard" in value)) {
    return false;
  }

  const standard = value["~standard"];

  return (
    typeof standard === "object" &&
    standard !== null &&
    "jsonSchema" in standard &&
    typeof standard.jsonSchema === "object" &&
    standard.jsonSchema !== null &&
    "input" in standard.jsonSchema &&
    typeof standard.jsonSchema.input === "function"
  );
};

const toEffectJsonSchema = (
  schema: unknown,
  options?: Readonly<Record<string, unknown>>,
) : JsonSchemaObject => {
  if (!hasEffectJsonSchema(schema)) {
    throw new Error("Effect Standard Schema is missing JSON Schema support.");
  }

  return schema["~standard"].jsonSchema.input({
    target: isJsonSchemaTarget(options?.target) ? options.target : DEFAULT_JSON_SCHEMA_TARGET,
  });
};

loadVendor("effect", {
  toJSONSchema: toEffectJsonSchema,
});

const detailFor = (detail: ValidationDetail, data: unknown, target: keyof ValidationTargets) => {
  return typeof detail === "function" ? detail(data, target) : detail;
};

export const validate = <T extends keyof ValidationTargets>(
  target: T,
  schema: Schema.Decoder<any>,
  detail: ValidationDetail,
) => {
  return honoValidator(
    target,
    Schema.toStandardJSONSchemaV1(Schema.toStandardSchemaV1(schema)),
    (result) => {
      if (result.success) {
        return undefined;
      }

      return createProblemResponse(invalidRequest(detailFor(detail, result.data, result.target)));
    },
  );
};

const isReadonlyRecord = (value: unknown): value is Readonly<Record<string, unknown>> => {
  return typeof value === "object" && value !== null;
};

export const mailboxListQueryDetail = (data: unknown) => {
  return isReadonlyRecord(data) && data.limit !== undefined
    ? INVALID_LIMIT_DETAIL
    : MISSING_MAILBOX_QUERY_DETAIL;
};

export const subscriptionBodyDetail = (data: unknown) => {
  if (!isReadonlyRecord(data)) {
    return INVALID_WEBHOOK_SUBSCRIPTION_BODY_DETAIL;
  }

  const eventTypes = data.eventTypes ?? data.event_types;

  if (
    Array.isArray(eventTypes) &&
    eventTypes.length > 0 &&
    eventTypes.every((eventType) => typeof eventType === "string" && eventType.length > 0)
  ) {
    return INVALID_WEBHOOK_EVENT_TYPES_DETAIL;
  }

  return INVALID_WEBHOOK_SUBSCRIPTION_BODY_DETAIL;
};
