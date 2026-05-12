import { WorkspaceApiKeyStore } from "@mailmon/core";
import { and, eq, isNull } from "drizzle-orm";
import { Effect, Layer, Option } from "effect";

import { workspaceApiKeys } from "../schema.js";
import { MailmonDatabase } from "./database.js";
import { hashApiKey, toWorkspaceApiKeyIdentity } from "./mappers.js";

export const createWorkspaceApiKeyStoreLayer = Layer.effect(
  WorkspaceApiKeyStore,
  Effect.gen(function* () {
    const database = yield* MailmonDatabase;

    return {
      getWorkspaceForApiKey: (apiKey: string) =>
        Effect.promise(async () => {
          const [row] = await database.db
            .select({
              workspaceId: workspaceApiKeys.workspaceId,
            })
            .from(workspaceApiKeys)
            .where(
              and(
                eq(workspaceApiKeys.apiKeyHash, hashApiKey(apiKey)),
                isNull(workspaceApiKeys.revokedAt),
              ),
            )
            .limit(1);

          return Option.fromNullishOr(row).pipe(
            Option.map((value) => toWorkspaceApiKeyIdentity(value.workspaceId)),
          );
        }),
    };
  }),
);
