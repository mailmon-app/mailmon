/// <reference types="node" />
import { defineConfig } from "drizzle-kit";

const databaseUrl = process.env.DATABASE_URL ?? "postgres://mailmon:mailmon@localhost:5432/mailmon";
const url = new URL(databaseUrl);
const hostParam = url.searchParams.get("host");

export default defineConfig({
  out: "./drizzle",
  schema: "./src/schema.ts",
  dialect: "postgresql",
  dbCredentials: hostParam
    ? {
        host: hostParam,
        user: url.username,
        password: url.password,
        database: url.pathname.slice(1),
        ssl: false,
      }
    : {
        url: databaseUrl,
      },
  verbose: true,
  strict: true,
});
