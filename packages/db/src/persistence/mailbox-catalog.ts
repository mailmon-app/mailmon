import { MailboxCatalog, MailboxPushNotificationStore } from "@mailmon/core";
import { and, asc, eq } from "drizzle-orm";
import { Effect, Layer, Option } from "effect";

import { mailboxes } from "../schema.js";
import { normalizeEmailAddress } from "./common-mappers.js";
import { MailmonDatabase } from "./database.js";
import { toMailboxResource } from "./public-resource-mappers.js";

export const createMailboxCatalogLayer = Layer.effect(
  MailboxCatalog,
  Effect.gen(function* () {
    const database = yield* MailmonDatabase;

    return {
      getMailbox: (
        mailboxId: string,
        options: Readonly<{
          workspaceId?: string;
        }> = {},
      ) =>
        Effect.promise(async () => {
          const [row] = await database.db
            .select()
            .from(mailboxes)
            .where(
              options.workspaceId === undefined
                ? eq(mailboxes.id, mailboxId)
                : and(eq(mailboxes.id, mailboxId), eq(mailboxes.workspaceId, options.workspaceId)),
            )
            .limit(1);

          return Option.fromNullishOr(row).pipe(Option.map(toMailboxResource));
        }),
    };
  }),
);

export const createMailboxPushNotificationStoreLayer = Layer.effect(
  MailboxPushNotificationStore,
  Effect.gen(function* () {
    const database = yield* MailmonDatabase;

    return {
      listMailboxesForGmailPushNotification: ({ emailAddress }) =>
        Effect.promise(async () => {
          const rows = await database.db
            .select()
            .from(mailboxes)
            .where(
              and(
                eq(mailboxes.provider, "gmail"),
                eq(mailboxes.status, "active"),
                eq(mailboxes.emailAddress, normalizeEmailAddress(emailAddress)),
              ),
            )
            .orderBy(asc(mailboxes.id));

          return rows.map((row) => toMailboxResource(row));
        }),
    };
  }),
);
