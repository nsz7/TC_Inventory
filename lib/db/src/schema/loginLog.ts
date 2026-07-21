import { pgTable, serial, integer, timestamp, text } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const loginLogTable = pgTable("login_log", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => usersTable.id),
  loginAt: timestamp("login_at").defaultNow().notNull(),
  logoutAt: timestamp("logout_at"),
  logoutType: text("logout_type"), // "manual" | "timeout", set at logout
});

export type LoginLogEntry = typeof loginLogTable.$inferSelect;
