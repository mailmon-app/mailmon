import type { CanonicalMessageRecord } from "@mailmon/core";

import type { GmailMessageResponse } from "./parsers.js";

const createCanonicalThreadId = (mailboxId: string, providerThreadId: string) => {
  return `thr_${mailboxId}_${providerThreadId}`;
};

const createCanonicalMessageId = (mailboxId: string, providerMessageId: string) => {
  return `msg_${mailboxId}_${providerMessageId}`;
};

const parseFromHeader = (value: string | null) => {
  if (value === null) {
    return {
      email: "unknown@example.invalid",
      name: null,
    };
  }

  const match = value.match(/^(.*)<([^>]+)>$/);

  if (match === null) {
    return {
      email: value.trim(),
      name: null,
    };
  }

  const rawName = match[1] ?? "";
  const rawEmail = match[2] ?? value.trim();
  const name = rawName.trim().replace(/^"|"$/g, "");

  return {
    email: rawEmail.trim(),
    name: name.length > 0 ? name : null,
  };
};

const getHeaderValue = (message: GmailMessageResponse, headerName: string) => {
  return (
    message.payload?.headers?.find(
      (header) => header.name.toLowerCase() === headerName.toLowerCase(),
    )?.value ?? null
  );
};

const toReceivedAt = (internalDate: string | undefined) => {
  if (internalDate === undefined) {
    return new Date(0).toISOString();
  }

  return new Date(Number.parseInt(internalDate, 10)).toISOString();
};

const toCanonicalMessage = (
  mailboxId: string,
  message: GmailMessageResponse,
): CanonicalMessageRecord => {
  const from = parseFromHeader(getHeaderValue(message, "From"));
  const subject = getHeaderValue(message, "Subject") ?? "";

  return {
    id: createCanonicalMessageId(mailboxId, message.id),
    threadId: createCanonicalThreadId(mailboxId, message.threadId),
    providerMessageId: message.id,
    providerThreadId: message.threadId,
    subject,
    from,
    snippet: message.snippet ?? "",
    receivedAt: toReceivedAt(message.internalDate),
    labelIds: [...(message.labelIds ?? [])],
  };
};

export const toSyncSnapshot = (
  mailboxId: string,
  messages: ReadonlyArray<GmailMessageResponse>,
  deletedProviderMessageIds: ReadonlyArray<string>,
) => {
  const canonicalMessages = messages.map((message) => toCanonicalMessage(mailboxId, message));
  const canonicalThreads = new Map<
    string,
    {
      id: string;
      lastMessageAt: string;
      providerThreadId: string;
      subject: string;
    }
  >();

  for (const message of canonicalMessages) {
    const existing = canonicalThreads.get(message.providerThreadId);

    if (
      existing === undefined ||
      Date.parse(message.receivedAt) >= Date.parse(existing.lastMessageAt)
    ) {
      canonicalThreads.set(message.providerThreadId, {
        id: message.threadId,
        lastMessageAt: message.receivedAt,
        providerThreadId: message.providerThreadId,
        subject: message.subject,
      });
    }
  }

  return {
    deletedProviderMessageIds: [...deletedProviderMessageIds],
    messages: canonicalMessages,
    threads: [...canonicalThreads.values()],
  };
};

export const mergeInitialSyncMessages = (
  baselineMessages: ReadonlyArray<GmailMessageResponse>,
  catchUp: Readonly<{
    deletedMessageIds: ReadonlyArray<string>;
    messages: ReadonlyArray<GmailMessageResponse>;
  }>,
) => {
  const deletedMessageIds = new Set(catchUp.deletedMessageIds);
  const messagesById = new Map<string, GmailMessageResponse>();

  for (const message of baselineMessages) {
    if (!deletedMessageIds.has(message.id)) {
      messagesById.set(message.id, message);
    }
  }

  for (const message of catchUp.messages) {
    if (!deletedMessageIds.has(message.id)) {
      messagesById.set(message.id, message);
    }
  }

  return [...messagesById.values()];
};
