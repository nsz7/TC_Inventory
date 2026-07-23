import { pgTable, text, serial, integer, boolean, date, timestamp, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { samplesTable } from "./samples";
import { usersTable } from "./users";

/**
 * One transfer operation and the containers it produced (e.g. FA26_001-01).
 * `initialQuantity` is fixed at creation and never modified — current count
 * is always computed from `container_events` (see computedQuantity.ts).
 */
export const batchesTable = pgTable(
  "batches",
  {
    id: serial("id").primaryKey(),
    sampleId: integer("sample_id")
      .notNull()
      .references(() => samplesTable.id),
    subcode: text("subcode").notNull(), // flat, zero-padded, never reset: "01", "02", "03"...
    stage: text("stage").notNull(),
    transferDate: date("transfer_date").notNull(),
    medium: text("medium"),
    containerType: text("container_type"),
    location: text("location").notNull(),
    initialQuantity: integer("initial_quantity").notNull(),
    contaminationAlert: boolean("contamination_alert").notNull().default(false),
    cleanTransferCount: integer("clean_transfer_count").notNull().default(0),
    hadContamination: boolean("had_contamination").notNull().default(false),
    notes: text("notes"),
    // Overrides the computed due date (transferDate + interval) for this one
    // batch. No separate "why overridden" field — notes covers it.
    dueDateOverride: date("due_date_override"),
    createdBy: integer("created_by").references(() => usersTable.id),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedBy: integer("updated_by").references(() => usersTable.id),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
    voided: boolean("voided").notNull().default(false),
    voidedBy: integer("voided_by").references(() => usersTable.id),
    voidedAt: timestamp("voided_at"),
    voidedReason: text("voided_reason"),
  },
  (table) => [unique().on(table.sampleId, table.subcode)],
);

export const insertBatchSchema = createInsertSchema(batchesTable).omit({
  id: true,
  subcode: true,
  contaminationAlert: true,
  cleanTransferCount: true,
  hadContamination: true,
  createdAt: true,
  updatedAt: true,
  voided: true,
  voidedBy: true,
  voidedAt: true,
  voidedReason: true,
});

export type InsertBatch = z.infer<typeof insertBatchSchema>;
export type Batch = typeof batchesTable.$inferSelect;
