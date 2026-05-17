import * as hegel from "@hegeldev/hegel";
import * as gs from "@hegeldev/hegel/generators";
import { expect, it, describe } from "vitest";

import { mergeInitialSyncMessages, toSyncSnapshot } from "./canonical-projection.js";
import { listGmailHistoryDelta } from "./history.js";
import type { GmailHistoryRecord, GmailMessageResponse } from "./parsers.js";
import { hegelSettings, notePbtCase } from "./test-hegel.js";

const messageIdGen = gs.sampledFrom([
  "gmail_msg_0",
  "gmail_msg_1",
  "gmail_msg_2",
  "gmail_msg_3",
  "gmail_msg_4",
]);
const historyOperationKindGen = gs.sampledFrom([
  "messagesAdded",
  "labelsAdded",
  "labelsRemoved",
  "messagesDeleted",
] as const);
const changedHistoryOperationKindGen = gs.sampledFrom([
  "messagesAdded",
  "labelsAdded",
  "labelsRemoved",
] as const);
const labelIdGen = gs.sampledFrom(["INBOX", "UNREAD", "STARRED", "CATEGORY_PROMOTIONS"]);

type HistoryOperationKind = "messagesAdded" | "labelsAdded" | "labelsRemoved" | "messagesDeleted";

interface HistoryOperation {
  readonly id: string;
  readonly kind: HistoryOperationKind;
}

const gmailMessage = (
  id: string,
  options: Readonly<{
    labelIds?: ReadonlyArray<string>;
    ordinal?: number;
  }> = {},
): GmailMessageResponse => {
  const ordinal = options.ordinal ?? 0;

  return {
    id,
    threadId: `gmail_thread_${id}`,
    internalDate: String(Date.parse("2026-03-24T00:00:00.000Z") + ordinal),
    labelIds: [...(options.labelIds ?? ["INBOX"])],
    payload: {
      headers: [
        { name: "From", value: "Mailmon <hello@mailmon.dev>" },
        { name: "Subject", value: `Property ${id} ${ordinal}` },
      ],
    },
    snippet: `Generated message ${id} ${ordinal}`,
  };
};

const historyRecordForOperation = (kind: HistoryOperationKind, id: string): GmailHistoryRecord => ({
  [kind]: [
    {
      message: {
        id,
      },
    },
  ],
});

const setFrom = (values: ReadonlyArray<string>) => new Set(values);

const expectSameSet = (actual: ReadonlyArray<string>, expected: ReadonlySet<string>) => {
  const actualSet = setFrom(actual);

  expect(actual).toHaveLength(actualSet.size);
  expect(actualSet).toEqual(expected);
  expect(actual).toHaveLength(expected.size);
};

const expectMessagesMatchById = (
  actual: ReadonlyArray<GmailMessageResponse>,
  expected: ReadonlyMap<string, GmailMessageResponse>,
) => {
  const actualIds = setFrom(actual.map((message) => message.id));

  expect(actual).toHaveLength(expected.size);
  expect(actualIds).toEqual(new Set(expected.keys()));

  for (const message of actual) {
    expect(expected.get(message.id)).toEqual(message);
  }
};

describe("Gmail history and initial sync properties", () => {
  it(
    "compacts generated multi-page Gmail history so delete wins over add and label changes",
    () =>
      hegel.testAsync(async (tc) => {
        const generatedPages = tc.draw(
          gs.arrays(
            gs.arrays(
              gs.record({
                id: messageIdGen,
                kind: historyOperationKindGen,
              }),
              { maxSize: 6 },
            ),
            { minSize: 2, maxSize: 4 },
          ),
        );
        const crossPageMessageId = tc.draw(messageIdGen);
        const crossPageChangeKind = tc.draw(changedHistoryOperationKindGen);
        const deleteFirst = tc.draw(gs.booleans());
        const missingMessageIds = tc.draw(gs.arrays(messageIdGen, { maxSize: 5 }));
        const missingMessageIdSet = setFrom(missingMessageIds);
        const firstCrossPageOperation: HistoryOperation = {
          id: crossPageMessageId,
          kind: deleteFirst ? "messagesDeleted" : crossPageChangeKind,
        };
        const lastCrossPageOperation: HistoryOperation = {
          id: crossPageMessageId,
          kind: deleteFirst ? crossPageChangeKind : "messagesDeleted",
        };
        const operationsByPage: ReadonlyArray<ReadonlyArray<HistoryOperation>> = generatedPages.map(
          (pageOperations, pageIndex) => {
            const operations: HistoryOperation[] = [...pageOperations];

            if (pageIndex === 0) {
              operations.unshift(firstCrossPageOperation);
            }

            if (pageIndex === generatedPages.length - 1) {
              operations.push(lastCrossPageOperation);
            }

            return operations;
          },
        );
        const operations = operationsByPage.flat();
        const historyPages = operationsByPage.map((pageOperations, pageIndex) => ({
          history: pageOperations.map((operation) =>
            historyRecordForOperation(operation.kind, operation.id),
          ),
          historyId: `hist_${pageIndex + 2}`,
          ...(pageIndex < operationsByPage.length - 1
            ? { nextPageToken: `page_token_${pageIndex + 1}` }
            : {}),
        }));
        const fetchedMessageIds: string[] = [];
        const expectedDeletedIds = new Set(
          operations
            .filter((operation) => operation.kind === "messagesDeleted")
            .map((operation) => operation.id),
        );
        const expectedChangedIds = new Set(
          operations
            .filter((operation) => operation.kind !== "messagesDeleted")
            .map((operation) => operation.id)
            .filter((id) => !expectedDeletedIds.has(id)),
        );
        const expectedReturnedMessages = new Map(
          [...expectedChangedIds]
            .filter((id) => !missingMessageIdSet.has(id))
            .map((id) => [id, gmailMessage(id)]),
        );
        const finalHistoryId = historyPages.at(-1)?.historyId;

        if (finalHistoryId === undefined) {
          throw new Error("history property generated no pages");
        }

        notePbtCase(tc, "history-delete-wins-compaction", {
          family: "multi-page-gmail-history-operation-sequence",
          operationsByPage: operationsByPage.map((pageOperations) =>
            pageOperations.map((operation) => `${operation.kind}:${operation.id}`),
          ),
          pageHistoryIds: historyPages.map((page) => page.historyId),
          pageTokens: historyPages.map((page) => page.nextPageToken ?? null),
          crossPageMessageId,
          deleteFirst,
          missingMessageIds,
          expectedDeletedIds: [...expectedDeletedIds],
          expectedChangedIds: [...expectedChangedIds],
          expectedReturnedMessageIds: [...expectedReturnedMessages.keys()],
        });

        let pageIndex = 0;
        const delta = await listGmailHistoryDelta({
          accessToken: "access-token",
          cursor: "hist_1",
          httpClient: {
            getJson: async ({ searchParams }) => {
              const expectedPageToken = pageIndex === 0 ? undefined : `page_token_${pageIndex}`;
              const page = historyPages[pageIndex];

              expect(searchParams?.pageToken).toBe(expectedPageToken);

              if (page === undefined) {
                throw new Error("history property requested too many pages");
              }

              pageIndex += 1;

              return {
                response: new Response(JSON.stringify(page)),
                responseBody: page,
              };
            },
            postJson: async () => {
              throw new Error("history property does not issue POST requests");
            },
          },
          mailboxId: "mbx_property",
          getMessage: async (messageId) => {
            fetchedMessageIds.push(messageId);
            return missingMessageIdSet.has(messageId) ? null : gmailMessage(messageId);
          },
        });

        expect(pageIndex).toBe(historyPages.length);
        expect(delta.nextCursor).toBe(finalHistoryId);
        expectSameSet(delta.deletedMessageIds, expectedDeletedIds);
        expectMessagesMatchById(delta.messages, expectedReturnedMessages);
        expectSameSet(fetchedMessageIds, expectedChangedIds);

        for (const deletedId of expectedDeletedIds) {
          expect(fetchedMessageIds).not.toContain(deletedId);
          expect(delta.messages.map((message) => message.id)).not.toContain(deletedId);
        }

        for (const missingMessageId of missingMessageIdSet) {
          expect(delta.messages.map((message) => message.id)).not.toContain(missingMessageId);
        }
      }, hegelSettings),
    60_000,
  );

  it(
    "merges generated initial sync messages so catch-up deletes suppress both sources",
    () =>
      hegel.test((tc) => {
        const baselineRecords = tc.draw(
          gs.arrays(
            gs.record({
              id: messageIdGen,
              labelIds: gs.arrays(labelIdGen, { maxSize: 5 }),
              ordinal: gs.integers({ minValue: 0, maxValue: 200 }),
            }),
            { maxSize: 10 },
          ),
        );
        const catchUpRecords = tc.draw(
          gs.arrays(
            gs.record({
              id: messageIdGen,
              labelIds: gs.arrays(labelIdGen, { maxSize: 5 }),
              ordinal: gs.integers({ minValue: 201, maxValue: 400 }),
            }),
            { maxSize: 10 },
          ),
        );
        const deletedMessageIds = tc.draw(gs.arrays(messageIdGen, { maxSize: 8 }));
        const deletedIdSet = new Set(deletedMessageIds);
        const baselineMessages = baselineRecords.map((record) =>
          gmailMessage(record.id, {
            labelIds: record.labelIds,
            ordinal: record.ordinal,
          }),
        );
        const catchUpMessages = catchUpRecords.map((record) =>
          gmailMessage(record.id, {
            labelIds: record.labelIds,
            ordinal: record.ordinal,
          }),
        );
        const expectedMessages = new Map<string, GmailMessageResponse>();

        notePbtCase(tc, "initial-sync-catchup-delete-wins", {
          family: "initial-sync-baseline-catchup-delete-sequence",
          baselineRecords,
          catchUpRecords,
          deletedMessageIds,
        });

        for (const message of baselineMessages) {
          if (!deletedIdSet.has(message.id)) {
            expectedMessages.set(message.id, message);
          }
        }

        for (const message of catchUpMessages) {
          if (!deletedIdSet.has(message.id)) {
            expectedMessages.set(message.id, message);
          }
        }

        const merged = mergeInitialSyncMessages(baselineMessages, {
          deletedMessageIds,
          messages: catchUpMessages,
        });

        expectMessagesMatchById(merged, expectedMessages);

        for (const message of merged) {
          expect(deletedIdSet.has(message.id)).toBe(false);
        }
      }, hegelSettings),
    60_000,
  );

  it(
    "preserves generated label arrays through Gmail projection for DB normalization",
    () =>
      hegel.test((tc) => {
        const labelIds = tc.draw(gs.arrays(labelIdGen, { maxSize: 8 }));

        notePbtCase(tc, "label-ids-are-normalized", {
          family: "gmail-projection-label-array",
          labelIds,
        });

        const snapshot = toSyncSnapshot(
          "mbx_property",
          [gmailMessage("gmail_msg_0", { labelIds })],
          [],
        );
        const message = snapshot.messages[0];

        if (message === undefined) {
          throw new Error("snapshot did not include generated message");
        }

        expect(message.labelIds).toEqual(labelIds);
      }, hegelSettings),
    60_000,
  );
});
