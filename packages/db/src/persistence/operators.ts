import { createHash, randomBytes } from "node:crypto";

import { transitionForCredentialUnreadable, type MailboxEventEnvelope } from "@mailmon/core";
import { GmailRefreshTokenCipher, type GmailRefreshTokenInspection } from "@mailmon/gmail";
import { and, asc, eq, gte, isNull, lte } from "drizzle-orm";
import { Effect } from "effect";

import {
  gmailMailboxCredentials,
  mailboxEvents,
  mailboxes,
  webhookEndpoints,
  workspaceApiKeys,
  workspaces,
} from "../schema.js";
import { MailmonDatabase, withDatabase } from "./database.js";
import { toDate, toMailboxOperationalTransitionUpdate } from "./mappers.js";

export interface CreatedWorkspaceOperatorResult {
  readonly workspaceId: string;
  readonly created: boolean;
}

export interface CreatedWorkspaceApiKeyOperatorResult {
  readonly apiKeyId: string;
  readonly apiKey: string;
  readonly keyPrefix: "mm_live_" | "mm_test_";
  readonly workspaceId: string;
}

export interface RevokedWorkspaceApiKeyOperatorResult {
  readonly apiKeyId: string | null;
  readonly revoked: boolean;
}

export interface LocalReplayMailboxEvent {
  readonly id: string;
  readonly mailboxId: string;
  readonly occurredAt: string;
  readonly payload: MailboxEventEnvelope;
}

export interface LocalReplayWebhookEndpoint {
  readonly webhookEndpointId: string;
  readonly workspaceId: string;
}

export type GmailMailboxCredentialAuditStatus =
  | "encrypted_current"
  | "encrypted_rewrap_required"
  | "plaintext"
  | "unreadable";

export interface GmailMailboxCredentialAuditItem {
  readonly keyId: string | null;
  readonly mailboxId: string;
  readonly status: GmailMailboxCredentialAuditStatus;
}

export interface GmailMailboxCredentialAuditSummary {
  readonly encryptedCurrent: number;
  readonly encryptedRewrapRequired: number;
  readonly plaintext: number;
  readonly total: number;
  readonly unreadable: number;
}

export interface GmailMailboxCredentialAuditReport extends GmailMailboxCredentialAuditSummary {
  readonly items: ReadonlyArray<GmailMailboxCredentialAuditItem>;
}

export interface GmailMailboxCredentialRewrapResult {
  readonly alreadyCurrent: number;
  readonly markedReconnectRequired: number;
  readonly rewrapped: number;
  readonly staleSkipped: number;
  readonly total: number;
  readonly unreadable: number;
}

const hashApiKey = (apiKey: string) => createHash("sha256").update(apiKey).digest("hex");
const generateWorkspaceApiKey = (prefix: "mm_live_" | "mm_test_") =>
  prefix + randomBytes(32).toString("base64url");

const toGmailMailboxCredentialAuditStatus = (
  inspection: GmailRefreshTokenInspection,
): GmailMailboxCredentialAuditStatus => {
  if (inspection.storage === "plaintext") {
    return "plaintext";
  }

  return inspection.rewrapRequired ? "encrypted_rewrap_required" : "encrypted_current";
};

const summarizeGmailMailboxCredentialAuditItems = (
  items: ReadonlyArray<GmailMailboxCredentialAuditItem>,
): GmailMailboxCredentialAuditSummary => {
  return {
    encryptedCurrent: items.filter((item) => item.status === "encrypted_current").length,
    encryptedRewrapRequired: items.filter((item) => item.status === "encrypted_rewrap_required")
      .length,
    plaintext: items.filter((item) => item.status === "plaintext").length,
    total: items.length,
    unreadable: items.filter((item) => item.status === "unreadable").length,
  };
};

export const auditGmailMailboxCredentials = () =>
  Effect.gen(function* () {
    const database = yield* MailmonDatabase;
    const gmailRefreshTokenCipher = yield* GmailRefreshTokenCipher;
    const credentialRows = yield* Effect.promise(() =>
      database.db
        .select({
          mailboxId: gmailMailboxCredentials.mailboxId,
          refreshTokenCiphertext: gmailMailboxCredentials.refreshTokenCiphertext,
        })
        .from(gmailMailboxCredentials),
    );
    const items = yield* Effect.forEach(credentialRows, (credential) =>
      gmailRefreshTokenCipher.inspectRefreshToken(credential.refreshTokenCiphertext).pipe(
        Effect.match({
          onFailure: () =>
            ({
              keyId: null,
              mailboxId: credential.mailboxId,
              status: "unreadable",
            }) satisfies GmailMailboxCredentialAuditItem,
          onSuccess: (inspection) =>
            ({
              keyId: inspection.keyId,
              mailboxId: credential.mailboxId,
              status: toGmailMailboxCredentialAuditStatus(inspection),
            }) satisfies GmailMailboxCredentialAuditItem,
        }),
      ),
    );

    return {
      ...summarizeGmailMailboxCredentialAuditItems(items),
      items,
    } satisfies GmailMailboxCredentialAuditReport;
  });

export const rewrapGmailMailboxCredentials = (options?: {
  readonly markUnreadableReconnectRequired?: boolean;
  readonly observedAt?: string;
}) =>
  Effect.gen(function* () {
    const database = yield* MailmonDatabase;
    const gmailRefreshTokenCipher = yield* GmailRefreshTokenCipher;
    const observedAt = toDate(options?.observedAt ?? new Date().toISOString());
    const markUnreadableReconnectRequired = options?.markUnreadableReconnectRequired ?? false;
    const credentialRows = yield* Effect.promise(() =>
      database.db
        .select({
          mailboxId: gmailMailboxCredentials.mailboxId,
          refreshTokenCiphertext: gmailMailboxCredentials.refreshTokenCiphertext,
        })
        .from(gmailMailboxCredentials),
    );
    const result = {
      alreadyCurrent: 0,
      markedReconnectRequired: 0,
      rewrapped: 0,
      staleSkipped: 0,
      total: credentialRows.length,
      unreadable: 0,
    };

    for (const credential of credentialRows) {
      const rewrappedRefreshToken = yield* gmailRefreshTokenCipher
        .rewrapRefreshToken(credential.refreshTokenCiphertext)
        .pipe(
          Effect.match({
            onFailure: (error) => ({ _tag: "Failure" as const, error }),
            onSuccess: (value) => ({ _tag: "Success" as const, value }),
          }),
        );

      if (rewrappedRefreshToken._tag === "Failure") {
        if (markUnreadableReconnectRequired) {
          const mailboxTransitionUpdate = toMailboxOperationalTransitionUpdate(
            transitionForCredentialUnreadable({ occurredAt: observedAt.toISOString() }),
          );

          yield* Effect.promise(() =>
            database.db
              .update(mailboxes)
              .set({
                ...mailboxTransitionUpdate,
                updatedAt: observedAt,
              })
              .where(eq(mailboxes.id, credential.mailboxId)),
          );
          result.markedReconnectRequired += 1;
          continue;
        }

        result.unreadable += 1;
        continue;
      }

      if (rewrappedRefreshToken.value === credential.refreshTokenCiphertext) {
        result.alreadyCurrent += 1;
        continue;
      }

      const updatedRows = yield* Effect.promise(() =>
        database.db
          .update(gmailMailboxCredentials)
          .set({
            refreshTokenCiphertext: rewrappedRefreshToken.value,
            updatedAt: observedAt,
          })
          .where(
            and(
              eq(gmailMailboxCredentials.mailboxId, credential.mailboxId),
              eq(gmailMailboxCredentials.refreshTokenCiphertext, credential.refreshTokenCiphertext),
            ),
          )
          .returning({ mailboxId: gmailMailboxCredentials.mailboxId }),
      );

      if (updatedRows.length === 0) {
        result.staleSkipped += 1;
        continue;
      }

      result.rewrapped += 1;
    }

    return result satisfies GmailMailboxCredentialRewrapResult;
  });
export const createWorkspaceForOperators = (params: {
  readonly connectionString: string;
  readonly workspaceId?: string;
}) =>
  withDatabase(params.connectionString, async (database) => {
    const now = new Date();
    const workspaceId = params.workspaceId ?? `ws_${globalThis.crypto.randomUUID()}`;
    const [inserted] = await database.db
      .insert(workspaces)
      .values({
        id: workspaceId,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoNothing({
        target: workspaces.id,
      })
      .returning({
        id: workspaces.id,
      });

    return {
      workspaceId,
      created: inserted !== undefined,
    } satisfies CreatedWorkspaceOperatorResult;
  });

export const createWorkspaceApiKeyForOperators = (params: {
  readonly connectionString: string;
  readonly keyPrefix: "mm_live_" | "mm_test_";
  readonly workspaceId: string;
}) =>
  withDatabase(params.connectionString, async (database) => {
    const now = new Date();
    const apiKey = generateWorkspaceApiKey(params.keyPrefix);
    const [row] = await database.db
      .insert(workspaceApiKeys)
      .values({
        id: `wak_${globalThis.crypto.randomUUID()}`,
        workspaceId: params.workspaceId,
        keyPrefix: params.keyPrefix,
        apiKeyHash: hashApiKey(apiKey),
        revokedAt: null,
        createdAt: now,
        updatedAt: now,
      })
      .returning({
        id: workspaceApiKeys.id,
      });

    if (row === undefined) {
      throw new Error(`Workspace API key insert failed for workspace ${params.workspaceId}.`);
    }

    return {
      apiKeyId: row.id,
      apiKey,
      keyPrefix: params.keyPrefix,
      workspaceId: params.workspaceId,
    } satisfies CreatedWorkspaceApiKeyOperatorResult;
  });

export const revokeWorkspaceApiKeyForOperators = (params: {
  readonly apiKey?: string;
  readonly apiKeyId?: string;
  readonly connectionString: string;
}) =>
  withDatabase(params.connectionString, async (database) => {
    if (params.apiKey === undefined && params.apiKeyId === undefined) {
      throw new Error("Either apiKey or apiKeyId is required to revoke a workspace API key.");
    }

    const now = new Date();
    const [row] = await database.db
      .update(workspaceApiKeys)
      .set({
        revokedAt: now,
        updatedAt: now,
      })
      .where(
        and(
          params.apiKeyId === undefined
            ? eq(workspaceApiKeys.apiKeyHash, hashApiKey(params.apiKey ?? ""))
            : eq(workspaceApiKeys.id, params.apiKeyId),
          isNull(workspaceApiKeys.revokedAt),
        ),
      )
      .returning({
        id: workspaceApiKeys.id,
      });

    return {
      apiKeyId: row?.id ?? params.apiKeyId ?? null,
      revoked: row !== undefined,
    } satisfies RevokedWorkspaceApiKeyOperatorResult;
  });

export const listMailboxEventsForLocalReplay = (params: {
  readonly connectionString: string;
  readonly mailboxId: string;
  readonly since: string;
  readonly until?: string;
  readonly limit?: number;
}) =>
  withDatabase(params.connectionString, async (database) => {
    const since = toDate(params.since);
    const until = params.until === undefined ? null : toDate(params.until);
    const predicates = [
      eq(mailboxEvents.mailboxId, params.mailboxId),
      gte(mailboxEvents.occurredAt, since),
      ...(until === null ? [] : [lte(mailboxEvents.occurredAt, until)]),
    ];
    const rows = await database.db
      .select({
        id: mailboxEvents.id,
        mailboxId: mailboxEvents.mailboxId,
        occurredAt: mailboxEvents.occurredAt,
        payload: mailboxEvents.payload,
      })
      .from(mailboxEvents)
      .where(and(...predicates))
      .orderBy(asc(mailboxEvents.occurredAt), asc(mailboxEvents.id))
      .limit(params.limit ?? 500);

    return rows.map((row) => ({
      id: row.id,
      mailboxId: row.mailboxId,
      occurredAt: row.occurredAt.toISOString(),
      payload: row.payload,
    })) satisfies ReadonlyArray<LocalReplayMailboxEvent>;
  });

export const ensureLocalReplayWebhookEndpoint = (params: {
  readonly connectionString: string;
  readonly forwardTo: string;
  readonly mailboxId: string;
  readonly signingSecret: string;
}) =>
  withDatabase(params.connectionString, async (database) => {
    const [mailbox] = await database.db
      .select({
        workspaceId: mailboxes.workspaceId,
      })
      .from(mailboxes)
      .where(eq(mailboxes.id, params.mailboxId))
      .limit(1);

    if (mailbox?.workspaceId === undefined || mailbox.workspaceId === null) {
      throw new Error(`Mailbox ${params.mailboxId} does not exist or has no workspace.`);
    }

    const now = new Date();
    const webhookEndpointId = `whe_local_replay_${createHash("sha256")
      .update(mailbox.workspaceId)
      .update("\0")
      .update(params.forwardTo)
      .digest("hex")
      .slice(0, 32)}`;

    await database.db
      .insert(webhookEndpoints)
      .values({
        id: webhookEndpointId,
        workspaceId: mailbox.workspaceId,
        url: params.forwardTo,
        description: "local replay endpoint",
        signingSecret: params.signingSecret,
        deliveryState: "healthy",
        consecutiveDeliveryFailures: 0,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [webhookEndpoints.workspaceId, webhookEndpoints.url],
        set: {
          description: "local replay endpoint",
          signingSecret: params.signingSecret,
          updatedAt: now,
        },
      });

    const [endpoint] = await database.db
      .select({
        id: webhookEndpoints.id,
      })
      .from(webhookEndpoints)
      .where(
        and(
          eq(webhookEndpoints.workspaceId, mailbox.workspaceId),
          eq(webhookEndpoints.url, params.forwardTo),
        ),
      )
      .limit(1);

    if (endpoint === undefined) {
      throw new Error(`Local Replay webhook endpoint ${params.forwardTo} could not be prepared.`);
    }

    return {
      webhookEndpointId: endpoint.id,
      workspaceId: mailbox.workspaceId,
    } satisfies LocalReplayWebhookEndpoint;
  });
