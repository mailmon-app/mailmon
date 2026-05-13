import { createHash } from "node:crypto";

import {
  type CanonicalMessageRecord,
  type CanonicalThreadRecord,
  type MailboxEventEnvelope,
  type MailboxEventType,
  type MailboxSyncCommitResult,
  type ProblemDetails,
} from "@mailmon/core";

import { normalizeLabelIds } from "./canonical-state-mappers.js";
import { toDate } from "./common-mappers.js";

export type MailboxSyncApplyTransactionResult =
  | {
      readonly kind: "committed";
      readonly result: MailboxSyncCommitResult;
    }
  | {
      readonly kind: "failed";
      readonly problem: ProblemDetails;
    };

const toMailboxMessageEventData = (message: CanonicalMessageRecord) => {
  return {
    messageId: message.id,
    threadId: message.threadId,
    providerMessageId: message.providerMessageId,
    providerThreadId: message.providerThreadId,
    subject: message.subject,
    snippet: message.snippet,
    receivedAt: message.receivedAt,
    labelIds: normalizeLabelIds(message.labelIds),
  };
};

const toMailboxThreadEventData = (thread: CanonicalThreadRecord) => {
  return {
    threadId: thread.id,
    providerThreadId: thread.providerThreadId,
    subject: thread.subject,
    lastMessageAt: thread.lastMessageAt,
  };
};

const createStableMailboxEventId = (
  syncRunId: string,
  eventType: MailboxEventType,
  mailboxId: string,
  resourceId: string,
) => {
  const hash = createHash("sha256")
    .update(syncRunId)
    .update("\0")
    .update(eventType)
    .update("\0")
    .update(mailboxId)
    .update("\0")
    .update(resourceId)
    .digest("hex");

  return `evt_${hash}`;
};

export const createMessageCreatedMailboxEvent = (params: {
  readonly syncRunId: string;
  readonly occurredAt: string;
  readonly workspaceId: string;
  readonly tenantExternalId: string;
  readonly mailboxId: string;
  readonly message: CanonicalMessageRecord;
}): MailboxEventEnvelope => {
  const data = toMailboxMessageEventData(params.message);

  return {
    id: createStableMailboxEventId(
      params.syncRunId,
      "message.created",
      params.mailboxId,
      params.message.id,
    ),
    type: "message.created",
    occurredAt: params.occurredAt,
    workspaceId: params.workspaceId,
    tenantExternalId: params.tenantExternalId,
    mailboxId: params.mailboxId,
    data,
    schemaVersion: 1,
  };
};

export const createMessageUpdatedMailboxEvent = (params: {
  readonly syncRunId: string;
  readonly occurredAt: string;
  readonly workspaceId: string;
  readonly tenantExternalId: string;
  readonly mailboxId: string;
  readonly message: CanonicalMessageRecord;
}): MailboxEventEnvelope => {
  const data = toMailboxMessageEventData(params.message);

  return {
    id: createStableMailboxEventId(
      params.syncRunId,
      "message.updated",
      params.mailboxId,
      params.message.id,
    ),
    type: "message.updated",
    occurredAt: params.occurredAt,
    workspaceId: params.workspaceId,
    tenantExternalId: params.tenantExternalId,
    mailboxId: params.mailboxId,
    data,
    schemaVersion: 1,
  };
};

export const createThreadUpdatedMailboxEvent = (params: {
  readonly syncRunId: string;
  readonly occurredAt: string;
  readonly workspaceId: string;
  readonly tenantExternalId: string;
  readonly mailboxId: string;
  readonly thread: CanonicalThreadRecord;
}): MailboxEventEnvelope => {
  const data = toMailboxThreadEventData(params.thread);

  return {
    id: createStableMailboxEventId(
      params.syncRunId,
      "thread.updated",
      params.mailboxId,
      params.thread.id,
    ),
    type: "thread.updated",
    occurredAt: params.occurredAt,
    workspaceId: params.workspaceId,
    tenantExternalId: params.tenantExternalId,
    mailboxId: params.mailboxId,
    data,
    schemaVersion: 1,
  };
};

export const toMailboxEventInsert = (event: MailboxEventEnvelope) => {
  return {
    id: event.id,
    mailboxId: event.mailboxId,
    eventType: event.type,
    occurredAt: toDate(event.occurredAt),
    payload: event,
  };
};
