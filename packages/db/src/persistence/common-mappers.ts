import { createHash } from "node:crypto";

import type { WorkspaceApiKeyIdentity } from "@mailmon/core";

export const hashApiKey = (apiKey: string) => {
  return createHash("sha256").update(apiKey).digest("hex");
};

export const normalizeEmailAddress = (emailAddress: string) => {
  return emailAddress.trim().toLowerCase();
};

export const createMailboxId = () => {
  return `mbx_${globalThis.crypto.randomUUID()}`;
};

export const toDate = (value: string) => {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid ISO timestamp: ${value}`);
  }

  return date;
};

export const toIsoString = (value: Date | null) => {
  return value === null ? null : value.toISOString();
};

export const addMillisecondsToIsoTimestamp = (timestamp: string, milliseconds: number) => {
  return new Date(Date.parse(timestamp) + milliseconds).toISOString();
};

export const getLatestCompletedAt = (
  rows: ReadonlyArray<{
    readonly completedAt: Date | null;
  }>,
) => {
  return rows.reduce<Date | null>((latest, row) => {
    if (row.completedAt === null) {
      return latest;
    }

    if (latest === null || row.completedAt.getTime() > latest.getTime()) {
      return row.completedAt;
    }

    return latest;
  }, null);
};

export const toWorkspaceApiKeyIdentity = (workspaceId: string): WorkspaceApiKeyIdentity => {
  return {
    workspaceId,
  };
};
