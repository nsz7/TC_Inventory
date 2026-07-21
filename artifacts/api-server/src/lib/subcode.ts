import { db, batchesTable } from "@workspace/db";
import { eq } from "drizzle-orm";

/** The type of the `tx` parameter passed into a `db.transaction(async (tx) => ...)` callback. */
export type DbOrTx = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Flat, zero-padded, never-reset serial: "01", "02", "03"... Scoped to one
 * sample's whole life, regardless of stage. Must run inside the same
 * transaction as the batch insert it's for, to avoid a race between two
 * concurrent creations picking the same subcode.
 *
 * Computes the max in JS rather than `ORDER BY subcode DESC LIMIT 1` in SQL:
 * subcode is text, so a lexicographic sort gives the wrong answer once a
 * sample passes 99 batches ("100" sorts before "99").
 */
export async function nextSubcode(tx: DbOrTx, sampleId: number): Promise<string> {
  const existing = await tx
    .select({ subcode: batchesTable.subcode })
    .from(batchesTable)
    .where(eq(batchesTable.sampleId, sampleId));

  const maxUsed = existing.reduce((max, row) => Math.max(max, parseInt(row.subcode, 10)), 0);
  return String(maxUsed + 1).padStart(2, "0");
}
