import { pgTable, integer, timestamp } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

/** Singleton row (id is always 1) holding global defaults used by Part 2. */
export const appSettingsTable = pgTable("app_settings", {
  id: integer("id").primaryKey(),
  defaultMinStorageStock: integer("default_min_storage_stock").notNull().default(5),
  defaultStorageRenewalIntervalMonths: integer("default_storage_renewal_interval_months").notNull().default(6),
  updatedBy: integer("updated_by").references(() => usersTable.id),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type AppSettings = typeof appSettingsTable.$inferSelect;
