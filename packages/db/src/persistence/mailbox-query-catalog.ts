import {
  MailboxQueryCatalog,
  type ListMailboxMessagesRequest,
  type ListMailboxThreadsRequest,
  type ListResource,
  type MessageResource,
  type ThreadListItemResource,
} from "@mailmon/core";
import { and, asc, desc, eq, lt, or } from "drizzle-orm";
import { Effect, Layer, Option } from "effect";

import { mailboxes, messages, threads } from "../schema.js";
import { MailmonDatabase } from "./database.js";
import {
  decodePaginationCursor,
  encodePaginationCursor,
  toDate,
  toMessageResource,
  toThreadListItemResource,
  toThreadResource,
} from "./mappers.js";
import { isProblemDetails } from "./problems.js";

export const createMailboxQueryCatalogLayer = Layer.effect(
  MailboxQueryCatalog,
  Effect.gen(function* () {
    const database = yield* MailmonDatabase;

    return {
      listMessages: (request: ListMailboxMessagesRequest) =>
        Effect.tryPromise({
          catch: (error) => {
            if (isProblemDetails(error)) {
              return error;
            }

            throw error;
          },
          try: async () => {
            const paginationCursor =
              request.cursor === null ? null : decodePaginationCursor("messages", request.cursor);
            const whereClause =
              paginationCursor === null
                ? eq(messages.mailboxId, request.mailboxId)
                : and(
                    eq(messages.mailboxId, request.mailboxId),
                    or(
                      lt(messages.receivedAt, toDate(paginationCursor.timestamp)),
                      and(
                        eq(messages.receivedAt, toDate(paginationCursor.timestamp)),
                        lt(messages.id, paginationCursor.id),
                      ),
                    ),
                  );
            const rows = await database.db
              .select()
              .from(messages)
              .where(whereClause)
              .orderBy(desc(messages.receivedAt), desc(messages.id))
              .limit(request.limit + 1);
            const pageRows = rows.slice(0, request.limit);
            const nextCursor =
              rows.length > request.limit
                ? encodePaginationCursor({
                    id: pageRows[pageRows.length - 1]?.id ?? rows[request.limit - 1]!.id,
                    timestamp:
                      pageRows[pageRows.length - 1]?.receivedAt.toISOString() ??
                      rows[request.limit - 1]!.receivedAt.toISOString(),
                  })
                : null;

            return {
              object: "list",
              data: pageRows.map((row) => toMessageResource(row)),
              nextCursor,
            } satisfies ListResource<MessageResource>;
          },
        }),
      getMessage: (
        messageId: string,
        options: Readonly<{
          workspaceId?: string;
        }> = {},
      ) =>
        Effect.promise(async () => {
          const [row] = await database.db
            .select({
              message: messages,
            })
            .from(messages)
            .innerJoin(mailboxes, eq(messages.mailboxId, mailboxes.id))
            .where(
              options.workspaceId === undefined
                ? eq(messages.id, messageId)
                : and(eq(messages.id, messageId), eq(mailboxes.workspaceId, options.workspaceId)),
            )
            .limit(1);

          return Option.fromNullishOr(row?.message).pipe(
            Option.map((message) => toMessageResource(message)),
          );
        }),
      listThreads: (request: ListMailboxThreadsRequest) =>
        Effect.tryPromise({
          catch: (error) => {
            if (isProblemDetails(error)) {
              return error;
            }

            throw error;
          },
          try: async () => {
            const paginationCursor =
              request.cursor === null ? null : decodePaginationCursor("threads", request.cursor);
            const whereClause =
              paginationCursor === null
                ? eq(threads.mailboxId, request.mailboxId)
                : and(
                    eq(threads.mailboxId, request.mailboxId),
                    or(
                      lt(threads.lastMessageAt, toDate(paginationCursor.timestamp)),
                      and(
                        eq(threads.lastMessageAt, toDate(paginationCursor.timestamp)),
                        lt(threads.id, paginationCursor.id),
                      ),
                    ),
                  );
            const rows = await database.db
              .select()
              .from(threads)
              .where(whereClause)
              .orderBy(desc(threads.lastMessageAt), desc(threads.id))
              .limit(request.limit + 1);
            const pageRows = rows.slice(0, request.limit);
            const nextCursor =
              rows.length > request.limit
                ? encodePaginationCursor({
                    id: pageRows[pageRows.length - 1]?.id ?? rows[request.limit - 1]!.id,
                    timestamp:
                      pageRows[pageRows.length - 1]?.lastMessageAt.toISOString() ??
                      rows[request.limit - 1]!.lastMessageAt.toISOString(),
                  })
                : null;

            return {
              object: "list",
              data: pageRows.map((row) => toThreadListItemResource(row)),
              nextCursor,
            } satisfies ListResource<ThreadListItemResource>;
          },
        }),
      getThread: (
        threadId: string,
        options: Readonly<{
          workspaceId?: string;
        }> = {},
      ) =>
        Effect.promise(async () => {
          const [threadRow] = await database.db
            .select({
              thread: threads,
            })
            .from(threads)
            .innerJoin(mailboxes, eq(threads.mailboxId, mailboxes.id))
            .where(
              options.workspaceId === undefined
                ? eq(threads.id, threadId)
                : and(eq(threads.id, threadId), eq(mailboxes.workspaceId, options.workspaceId)),
            )
            .limit(1);

          if (threadRow === undefined) {
            return Option.none();
          }

          const threadMessages = await database.db
            .select()
            .from(messages)
            .where(eq(messages.threadId, threadRow.thread.id))
            .orderBy(asc(messages.receivedAt), asc(messages.id));

          return Option.some(toThreadResource(threadRow.thread, threadMessages));
        }),
    };
  }),
);
