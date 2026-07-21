import { pgTable, text, serial, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const varietiesTable = pgTable("varieties", {
  id: serial("id").primaryKey(),
  label: text("label").notNull().unique(),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertVarietySchema = createInsertSchema(varietiesTable).omit({
  id: true,
  createdAt: true,
});

export type InsertVariety = z.infer<typeof insertVarietySchema>;
export type Variety = typeof varietiesTable.$inferSelect;
