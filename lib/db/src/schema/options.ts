import { pgTable, text, serial, integer, boolean, timestamp, unique } from "drizzle-orm/pg-core";

export const lookupOptionsTable = pgTable(
  "lookup_options",
  {
    id: serial("id").primaryKey(),
    category: text("category").notNull(),
    label: text("label").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    // Entries in use can't be deleted, only deactivated — deactivated
    // entries disappear from dropdowns but still display correctly on
    // existing records.
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [unique().on(table.category, table.label)],
);

export type LookupOption = typeof lookupOptionsTable.$inferSelect;
