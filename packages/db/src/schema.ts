import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const bootstrapState = pgTable("bootstrap_state", {
  name: text("name").primaryKey(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
