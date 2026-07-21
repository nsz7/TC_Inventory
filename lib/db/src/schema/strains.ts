import { pgTable, text, serial, boolean, integer, timestamp, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { varietiesTable } from "./varieties";

export const strainsTable = pgTable(
  "strains",
  {
    id: serial("id").primaryKey(),
    varietyId: integer("variety_id")
      .notNull()
      .references(() => varietiesTable.id),
    label: text("label").notNull(),
    active: boolean("active").notNull().default(true),
    // null = follow the global default in app_settings
    minStorageStockOverride: integer("min_storage_stock_override"),
    storageRenewalIntervalMonthsOverride: integer("storage_renewal_interval_months_override"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [unique().on(table.varietyId, table.label)],
);

export const insertStrainSchema = createInsertSchema(strainsTable).omit({
  id: true,
  createdAt: true,
});

export type InsertStrain = z.infer<typeof insertStrainSchema>;
export type Strain = typeof strainsTable.$inferSelect;
