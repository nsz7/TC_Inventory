import { pgTable, text, serial, integer, date, timestamp, type AnyPgColumn } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const samplesTable = pgTable("samples", {
  id: serial("id").primaryKey(),
  sampleCode: text("sample_code").notNull().unique(),
  cultivar: text("cultivar").notNull(),
  stage: text("stage").notNull(),
  mediaType: text("media_type"),
  containerType: text("container_type"),
  quantity: integer("quantity").notNull().default(1),
  location: text("location").notNull(),
  status: text("status").notNull().default("active"),
  notes: text("notes"),
  dateInitiated: date("date_initiated").notNull(),
  nextActionDate: date("next_action_date"),
  nextAction: text("next_action"),
  parentSampleId: integer("parent_sample_id").references((): AnyPgColumn => samplesTable.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertSampleSchema = createInsertSchema(samplesTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const updateSampleSchema = createInsertSchema(samplesTable)
  .omit({ id: true, createdAt: true, updatedAt: true })
  .partial();

export type InsertSample = z.infer<typeof insertSampleSchema>;
export type UpdateSample = z.infer<typeof updateSampleSchema>;
export type Sample = typeof samplesTable.$inferSelect;
