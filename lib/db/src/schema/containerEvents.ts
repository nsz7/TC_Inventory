import { pgTable, text, serial, integer, boolean, date, timestamp, check, type AnyPgColumn } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { sql } from "drizzle-orm";
import { z } from "zod/v4";
import { batchesTable } from "./batches";
import { usersTable } from "./users";

/**
 * The fixed, code-defined set of event types. Never user-supplied — each
 * route hardcodes which one it writes — so a typo here is a compile-time
 * error (via the `enum` column option below) and, as a second line of
 * defense against anything that writes outside TypeScript, a DB check
 * constraint. A silently-misspelled event_type is otherwise invisible: it
 * just drops out of computedQuantitySql's sums with no error anywhere.
 *
 * - transfer_out: containers that left the batch. Written with a
 *   target_batch_id when they arrived at one specific child batch (the
 *   pre-Part-2-fixes shape); written with target_batch_id null for the
 *   operation-level "N containers consumed" event on a subculture that
 *   produced several children (see the subculture route) — it's still
 *   true that containers left the batch, they just didn't collectively
 *   land in one place.
 * - discard: containers destroyed/lost, reason required.
 * - correction: manual adjustment to a miscounted or previously-unrecorded
 *   quantity, reason required.
 * - subculture: a child batch was created from this one. Always quantity
 *   0 and always carries a target_batch_id (one row per child) — it
 *   records that tissue was taken, not that any container count changed.
 *   Written on every subculture operation regardless of whether anything
 *   was consumed, so the source batch's timeline never goes silent on its
 *   own most common activity just because the lab kept containers back.
 *   is_rescue marks whether that specific creation was a rescue of
 *   contaminated material (forces the child's alert on, bypassing normal
 *   inheritance) — false on every other event type.
 */
export const CONTAINER_EVENT_TYPES = ["transfer_out", "discard", "correction", "subculture"] as const;
export type ContainerEventType = (typeof CONTAINER_EVENT_TYPES)[number];

/**
 * Every container that leaves a batch, plus the subculture records that
 * anchor lineage on the source side, is a row here. Current count is always
 * initialQuantity - Σ(transfer_out) - Σ(discard) ± Σ(correction), excluding
 * voided rows and excluding subculture rows entirely (see
 * computedQuantity.ts). Never update quantity in place.
 */
export const containerEventsTable = pgTable(
  "container_events",
  {
    id: serial("id").primaryKey(),
    batchId: integer("batch_id")
      .notNull()
      .references(() => batchesTable.id),
    eventType: text("event_type", { enum: CONTAINER_EVENT_TYPES }).notNull(),
    quantity: integer("quantity").notNull(),
    reason: text("reason"), // required (in application logic) for discard and correction
    // Set for subculture (always — one row per child); set for transfer_out
    // only in the legacy per-output-consumption shape. Null on the
    // operation-level consumption transfer_out and on discard/correction.
    targetBatchId: integer("target_batch_id").references((): AnyPgColumn => batchesTable.id),
    // Only meaningful on a subculture row — whether this specific creation
    // was a rescue of contaminated material rather than an ordinary
    // transfer. Persisted here (not inferred from the resulting alert)
    // because an inherited alert and a freshly-raised one are otherwise
    // indistinguishable: both just show contaminationAlert=true on the
    // child.
    isRescue: boolean("is_rescue").notNull().default(false),
    eventDate: date("event_date").notNull(),
    note: text("note"),
    createdBy: integer("created_by").references(() => usersTable.id),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    voided: boolean("voided").notNull().default(false),
    voidedBy: integer("voided_by").references(() => usersTable.id),
    voidedAt: timestamp("voided_at"),
    voidedReason: text("voided_reason"),
  },
  (table) => [
    check(
      "container_events_event_type_check",
      sql`${table.eventType} in (${sql.raw(CONTAINER_EVENT_TYPES.map((t) => `'${t}'`).join(", "))})`,
    ),
  ],
);

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
