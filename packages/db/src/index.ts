import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as bootstrap from "./bootstrap.js";
import * as schema from "./schema.js";

export { bootstrap, schema };

export const createSqlClient = (connectionString: string) => {
  return postgres(connectionString);
};

export const createDb = (connectionString: string) => {
  const client = createSqlClient(connectionString);

  return {
    client,
    db: drizzle(client, { schema }),
  };
};
