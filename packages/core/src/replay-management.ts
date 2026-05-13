import { Effect, Option } from "effect";

import type { CreateReplayRequest } from "./contracts.js";
import { invalidReplayTimeRange, replayNotFound } from "./problems.js";
import { getMailboxOrFail, getWebhookEndpointOrFail } from "./resource-queries.js";
import { ReplayStore } from "./services.js";

const createReplayId = () => {
  return `rpl_${globalThis.crypto.randomUUID()}`;
};

const parseReplayTimestamp = (value: string) => {
  const timestamp = Date.parse(value);

  return Number.isNaN(timestamp) ? null : timestamp;
};

const validateReplayTimeRange = (request: CreateReplayRequest) => {
  const start = parseReplayTimestamp(request.startTime);
  const end = parseReplayTimestamp(request.endTime);

  if (start === null || end === null || start > end) {
    return Effect.fail(invalidReplayTimeRange());
  }

  return Effect.succeed({
    endTime: new Date(end).toISOString(),
    startTime: new Date(start).toISOString(),
  });
};

export const createReplay = (workspaceId: string, request: CreateReplayRequest) =>
  Effect.gen(function* () {
    const range = yield* validateReplayTimeRange(request);
    yield* getMailboxOrFail(request.mailboxId, { workspaceId });
    yield* getWebhookEndpointOrFail(request.webhookEndpointId, { workspaceId });

    const replayStore = yield* ReplayStore;

    return yield* replayStore.createReplay({
      ...request,
      endTime: range.endTime,
      startTime: range.startTime,
      createdAt: new Date().toISOString(),
      id: createReplayId(),
      workspaceId,
    });
  });

export const getReplayOrFail = (
  replayId: string,
  options: Readonly<{
    workspaceId?: string;
  }> = {},
) =>
  Effect.gen(function* () {
    const replayStore = yield* ReplayStore;
    const replay = yield* replayStore.getReplay(replayId, options);

    return yield* Option.match(replay, {
      onNone: () => Effect.fail(replayNotFound(replayId)),
      onSome: (resource) => Effect.succeed(resource),
    });
  });
