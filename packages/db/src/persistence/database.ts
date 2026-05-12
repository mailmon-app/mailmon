import { Context, Effect, Layer } from "effect";

import { createDb } from "../client.js";

export type DatabaseHandle = ReturnType<typeof createDb>;

export class MailmonDatabase extends Context.Service<MailmonDatabase, DatabaseHandle>()(
  "@mailmon/db/MailmonDatabase",
) {}

export const createDatabaseLayer = (connectionString: string) =>
  Layer.effect(
    MailmonDatabase,
    Effect.acquireRelease(
      Effect.sync(() => createDb(connectionString)),
      ({ client }) => Effect.promise(() => client.end()),
    ),
  );

export const withDatabase = <A>(
  connectionString: string,
  f: (database: DatabaseHandle) => Promise<A>,
) =>
  Effect.acquireUseRelease(
    Effect.sync(() => createDb(connectionString)),
    (database) => Effect.promise(() => f(database)),
    ({ client }) => Effect.promise(() => client.end()),
  );
