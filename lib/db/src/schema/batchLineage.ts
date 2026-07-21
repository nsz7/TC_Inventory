import { pgTable, serial, integer, timestamp, unique } from "drizzle-orm/pg-core";
import { batchesTable } from "./batches";

/**
 * Parent-child links between batches, kept in their own table (not a column
 * on batches) because pooling means a child can occasionally have more than
 * one parent. The everyday transfer UI creates exactly one row per child;
 * pooling (multiple rows for one child) is a separate action, Part 2.
 */
export const batchLineageTable = pgTable(
  "batch_lineage",
  {
    id: serial("id").primaryKey(),
    childBatchId: integer("child_batch_id")
      .notNull()
      .references(() => batchesTable.id),
    parentBatchId: integer("parent_batch_id")
      .notNull()
      .references(() => batchesTable.id),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [unique().on(table.childBatchId, table.parentBatchId)],
);

export type BatchLineage = typeof batchLineageTable.$inferSelect;
