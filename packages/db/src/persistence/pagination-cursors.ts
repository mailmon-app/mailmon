import { invalidPaginationCursor } from "@mailmon/core";

import { isProblemDetails } from "./problems.js";

interface PaginationCursor {
  readonly id: string;
  readonly timestamp: string;
}

interface SyncRunPaginationCursor {
  readonly id: string;
  readonly startedAt: string;
}

const isCanonicalIsoTimestamp = (timestamp: string) => {
  const parsed = Date.parse(timestamp);

  return !Number.isNaN(parsed) && new Date(parsed).toISOString() === timestamp;
};

export const encodePaginationCursor = (cursor: PaginationCursor) => {
  const payload = JSON.stringify({
    id: cursor.id,
    timestamp: cursor.timestamp,
  });

  return `cur_${Buffer.from(payload, "utf8").toString("base64url")}`;
};

export const decodePaginationCursor = (
  resourceType: "messages" | "threads",
  cursor: string,
): PaginationCursor => {
  if (!cursor.startsWith("cur_")) {
    throw invalidPaginationCursor(resourceType);
  }

  try {
    const decoded = Buffer.from(cursor.slice(4), "base64url").toString("utf8");
    const payload = JSON.parse(decoded) as unknown;

    if (
      typeof payload !== "object" ||
      payload === null ||
      !("id" in payload) ||
      typeof payload.id !== "string" ||
      payload.id.length === 0 ||
      !("timestamp" in payload) ||
      typeof payload.timestamp !== "string" ||
      !isCanonicalIsoTimestamp(payload.timestamp)
    ) {
      throw invalidPaginationCursor(resourceType);
    }

    return {
      id: payload.id,
      timestamp: payload.timestamp,
    };
  } catch (error) {
    if (isProblemDetails(error)) {
      throw error;
    }

    throw invalidPaginationCursor(resourceType);
  }
};

export const encodeSyncRunPaginationCursor = (cursor: SyncRunPaginationCursor) => {
  const payload = JSON.stringify(cursor);

  return `cur_${Buffer.from(payload, "utf8").toString("base64url")}`;
};

export const decodeSyncRunPaginationCursor = (cursor: string): SyncRunPaginationCursor => {
  if (!cursor.startsWith("cur_")) {
    throw invalidPaginationCursor("sync_runs");
  }

  try {
    const decoded = Buffer.from(cursor.slice(4), "base64url").toString("utf8");
    const payload = JSON.parse(decoded) as unknown;

    if (
      typeof payload !== "object" ||
      payload === null ||
      !("id" in payload) ||
      typeof payload.id !== "string" ||
      payload.id.length === 0 ||
      !("startedAt" in payload) ||
      typeof payload.startedAt !== "string" ||
      !isCanonicalIsoTimestamp(payload.startedAt)
    ) {
      throw invalidPaginationCursor("sync_runs");
    }

    return {
      id: payload.id,
      startedAt: payload.startedAt,
    };
  } catch (error) {
    if (isProblemDetails(error)) {
      throw error;
    }

    throw invalidPaginationCursor("sync_runs");
  }
};
