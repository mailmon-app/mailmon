import type { CanonicalMessageRecord, CanonicalThreadRecord } from "@mailmon/core";

import { messages, threads } from "../schema.js";
import { toDate } from "./common-mappers.js";

type MessageRow = typeof messages.$inferSelect;
type ThreadRow = typeof threads.$inferSelect;

const parseDecimalHistoryCursor = (cursor: string): bigint | null => {
  if (!/^\d+$/.test(cursor)) {
    return null;
  }

  return BigInt(cursor);
};

const parseTrailingOrdinalCursor = (cursor: string) => {
  const match = /^(.*\D)(\d+)$/.exec(cursor);

  if (match === null) {
    return null;
  }
  const [, prefix, value] = match;

  if (prefix === undefined || value === undefined) {
    return null;
  }

  return {
    prefix,
    value: BigInt(value),
  };
};

export const isMailboxCursorRegression = (
  currentCursor: string | null,
  nextCursor: string | null,
) => {
  if (currentCursor === null || currentCursor === nextCursor) {
    return false;
  }

  if (nextCursor === null) {
    return true;
  }

  const currentDecimal = parseDecimalHistoryCursor(currentCursor);
  const nextDecimal = parseDecimalHistoryCursor(nextCursor);

  if (currentDecimal !== null && nextDecimal !== null) {
    return nextDecimal < currentDecimal;
  }

  if (currentDecimal !== null) {
    return true;
  }

  const currentOrdinal = parseTrailingOrdinalCursor(currentCursor);
  const nextOrdinal = parseTrailingOrdinalCursor(nextCursor);

  if (
    currentOrdinal !== null &&
    nextOrdinal !== null &&
    currentOrdinal.prefix === nextOrdinal.prefix
  ) {
    return nextOrdinal.value < currentOrdinal.value;
  }

  return false;
};

export const toThreadInsert = (mailboxId: string, thread: CanonicalThreadRecord) => {
  const timestamp = new Date();

  return {
    id: thread.id,
    mailboxId,
    providerThreadId: thread.providerThreadId,
    subject: thread.subject,
    lastMessageAt: toDate(thread.lastMessageAt),
    updatedAt: timestamp,
  };
};

export const toThreadUpdateSet = (thread: CanonicalThreadRecord) => {
  return {
    subject: thread.subject,
    lastMessageAt: toDate(thread.lastMessageAt),
    updatedAt: new Date(),
  };
};

export const toMessageInsert = (mailboxId: string, message: CanonicalMessageRecord) => {
  const timestamp = new Date();

  return {
    id: message.id,
    mailboxId,
    threadId: message.threadId,
    providerMessageId: message.providerMessageId,
    providerThreadId: message.providerThreadId,
    subject: message.subject,
    fromName: message.from.name,
    fromEmail: message.from.email,
    snippet: message.snippet,
    receivedAt: toDate(message.receivedAt),
    labelIds: normalizeLabelIds(message.labelIds),
    updatedAt: timestamp,
  };
};

export const toMessageUpdateSet = (message: CanonicalMessageRecord) => {
  return {
    threadId: message.threadId,
    providerThreadId: message.providerThreadId,
    subject: message.subject,
    fromName: message.from.name,
    fromEmail: message.from.email,
    snippet: message.snippet,
    receivedAt: toDate(message.receivedAt),
    labelIds: normalizeLabelIds(message.labelIds),
    updatedAt: new Date(),
  };
};

export const normalizeLabelIds = (labelIds: ReadonlyArray<string>) => {
  return [...new Set(labelIds)].toSorted();
};

const hasSameStringArrayValues = (left: ReadonlyArray<string>, right: ReadonlyArray<string>) => {
  return left.length === right.length && left.every((value, index) => value === right[index]);
};

export const toCanonicalThreadFromMessageRow = (
  row: Pick<MessageRow, "providerThreadId" | "receivedAt" | "subject" | "threadId">,
): CanonicalThreadRecord => {
  return {
    id: row.threadId,
    providerThreadId: row.providerThreadId,
    subject: row.subject,
    lastMessageAt: row.receivedAt.toISOString(),
  };
};

export const isSameCanonicalMessage = (row: MessageRow, message: CanonicalMessageRecord) => {
  return (
    row.id === message.id &&
    row.threadId === message.threadId &&
    row.providerMessageId === message.providerMessageId &&
    row.providerThreadId === message.providerThreadId &&
    row.subject === message.subject &&
    row.fromName === message.from.name &&
    row.fromEmail === message.from.email &&
    row.snippet === message.snippet &&
    row.receivedAt.getTime() === Date.parse(message.receivedAt) &&
    hasSameStringArrayValues(row.labelIds, normalizeLabelIds(message.labelIds))
  );
};

export const isSameCanonicalThread = (row: ThreadRow, thread: CanonicalThreadRecord) => {
  return (
    row.id === thread.id &&
    row.providerThreadId === thread.providerThreadId &&
    row.subject === thread.subject &&
    row.lastMessageAt.getTime() === Date.parse(thread.lastMessageAt)
  );
};
