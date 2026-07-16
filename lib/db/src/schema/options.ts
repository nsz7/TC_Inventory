import { pgTable, text, serial, integer, timestamp } from "drizzle-orm/pg-core";

export const lookupOptionsTable = pgTable("lookup_options", {
  id: serial("id").primaryKey(),
  category: text("category").notNull(),
  label: text("label").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type LookupOption = typeof lookupOptionsTable.$inferSelect;
