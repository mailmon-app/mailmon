import { Schema } from "effect";
import { validator as honoValidator } from "hono-openapi";
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

const detailFor = (detail: ValidationDetail, data: unknown, target: keyof ValidationTargets) => {
  return typeof detail === "function" ? detail(data, target) : detail;
};

export const validate = <T extends keyof ValidationTargets>(
  target: T,
  schema: Schema.Schema<any, any>,
  detail: ValidationDetail,
) => {
  return honoValidator(target, Schema.standardSchemaV1(schema), (result) => {
    if (result.success) {
      return undefined;
    }

    return createProblemResponse(invalidRequest(detailFor(detail, result.data, result.target)));
  });
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
