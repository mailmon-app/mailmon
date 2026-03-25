import type { ApiEnv } from "@mailmon/config";
import { createCorePersistenceLayer } from "@mailmon/db";
import { ManagedRuntime } from "effect";

export const createApiRuntime = (env: Pick<ApiEnv, "databaseUrl">) => {
  return ManagedRuntime.make(createCorePersistenceLayer(env.databaseUrl));
};

export type ApiRuntime = ReturnType<typeof createApiRuntime>;
