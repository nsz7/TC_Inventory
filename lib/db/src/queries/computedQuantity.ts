import { sql, type SQL } from "drizzle-orm";

/**
 * initial_quantity - Σ(transfer_out) - Σ(discard) + Σ(correction), excluding
 * voided container_events. This is the one place current batch quantity is
 * computed — every route selecting a batch's live count must select this
 * expression rather than storing/reading a mutable quantity column.
 *
 * Uses literal table-qualified identifiers (not interpolated Column
 * references) inside the correlated subqueries: interpolating
 * `batchesTable.id` renders as a bare `"id"`, which Postgres resolves
 * against container_events' own `id` column instead of correlating out to
 * `batches.id` (both tables have a same-named id column) — silently wrong.
 * Requires the caller to select from `batchesTable` unaliased (i.e. FROM
 * "batches" as written, not FROM "batches" AS something_else).
 */
export function computedQuantitySql(): SQL<number> {
  return sql<number>`(
    "batches"."initial_quantity"
    - coalesce((
        select sum(ce.quantity) from container_events ce
        where ce.batch_id = "batches"."id" and ce.event_type = 'transfer_out' and ce.voided = false
      ), 0)
    - coalesce((
        select sum(ce.quantity) from container_events ce
        where ce.batch_id = "batches"."id" and ce.event_type = 'discard' and ce.voided = false
      ), 0)
    + coalesce((
        select sum(ce.quantity) from container_events ce
        where ce.batch_id = "batches"."id" and ce.event_type = 'correction' and ce.voided = false
      ), 0)
  )`;
}
