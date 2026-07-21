import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const changeLogTable = pgTable("change_log", {
  id: serial("id").primaryKey(),
  recordType: text("record_type").notNull(), // "sample" | "batch"
  recordId: integer("record_id").notNull(),
  fieldName: text("field_name").notNull(),
  oldValue: text("old_value"),
  newValue: text("new_value"),
  changedBy: integer("changed_by").references(() => usersTable.id),
  changedAt: timestamp("changed_at").defaultNow().notNull(),
});

export type ChangeLogEntry = typeof changeLogTable.$inferSelect;
