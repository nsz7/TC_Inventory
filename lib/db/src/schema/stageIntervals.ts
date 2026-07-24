import { pgTable, text, integer, boolean, timestamp } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

/**
 * The per-stage default interval (in days) used to compute a batch's due
 * date for every stage except long-term storage, which has its own
 * months-based global/per-strain precedence (see appSettings/strains).
 * One row per stage label (matches the "stage" lookup_options category).
 *
 * isPlaceholder starts true at seed time — these are invented numbers, not
 * real lab intervals, and the UI must say so clearly rather than presenting
 * them as correct. It flips to false the moment an admin sets a real value
 * through the settings PATCH route.
 */
export const stageIntervalsTable = pgTable("stage_intervals", {
  stage: text("stage").primaryKey(),
  intervalDays: integer("interval_days").notNull(),
  isPlaceholder: boolean("is_placeholder").notNull().default(true),
  updatedBy: integer("updated_by").references(() => usersTable.id),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type StageInterval = typeof stageIntervalsTable.$inferSelect;
