import { pgTable, text, serial, integer, boolean, date, timestamp, type AnyPgColumn } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { batchesTable } from "./batches";
import { usersTable } from "./users";

/**
 * Every container that leaves a batch is a row here — transferred out,
 * discarded, or a manual correction. Current count is always
 * initialQuantity - Σ(transfer_out) - Σ(discard) ± Σ(correction),
 * excluding voided rows. Never update quantity in place.
 */
export const containerEventsTable = pgTable("container_events", {
  id: serial("id").primaryKey(),
  batchId: integer("batch_id")
    .notNull()
    .references(() => batchesTable.id),
  eventType: text("event_type").notNull(), // "transfer_out" | "discard" | "correction"
  quantity: integer("quantity").notNull(),
  reason: text("reason"), // required (in application logic) for discard and correction
  targetBatchId: integer("target_batch_id").references((): AnyPgColumn => batchesTable.id), // set for transfer_out
  eventDate: date("event_date").notNull(),
  note: text("note"),
  createdBy: integer("created_by").references(() => usersTable.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  voided: boolean("voided").notNull().default(false),
  voidedBy: integer("voided_by").references(() => usersTable.id),
  voidedAt: timestamp("voided_at"),
  voidedReason: text("voided_reason"),
});

export const insertContainerEventSchema = createInsertSchema(containerEventsTable).omit({
  id: true,
  createdAt: true,
  voided: true,
  voidedBy: true,
  voidedAt: true,
  voidedReason: true,
});

export type InsertContainerEvent = z.infer<typeof insertContainerEventSchema>;
export type ContainerEvent = typeof containerEventsTable.$inferSelect;
