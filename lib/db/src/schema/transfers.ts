import { pgTable, text, serial, integer, date, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { samplesTable } from "./samples";

export const transfersTable = pgTable("transfers", {
  id: serial("id").primaryKey(),
  fromSampleId: integer("from_sample_id")
    .notNull()
    .references(() => samplesTable.id),
  toSampleId: integer("to_sample_id").references(() => samplesTable.id),
  transferDate: date("transfer_date").notNull(),
  fromLocation: text("from_location"),
  toLocation: text("to_location"),
  mediaType: text("media_type"),
  quantityTransferred: integer("quantity_transferred").notNull().default(1),
  technician: text("technician").notNull(),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertTransferSchema = createInsertSchema(transfersTable).omit({
  id: true,
  createdAt: true,
});

export type InsertTransfer = z.infer<typeof insertTransferSchema>;
export type Transfer = typeof transfersTable.$inferSelect;
