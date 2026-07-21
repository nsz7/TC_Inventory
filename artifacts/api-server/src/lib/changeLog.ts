import { db, changeLogTable } from "@workspace/db";

/** Key fields whose edits must be recorded, per the Part 1 brief. */
export const LOGGED_FIELDS = new Set([
  "transferDate",
  "stage",
  "medium",
  "containerType",
  "location",
  "initialQuantity",
  "contaminationAlert",
  "variety",
  "strain",
  "archived",
  "archivedReason",
  "voided",
  "voidedReason",
]);

function serialize(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

/**
 * Diffs `before`/`after` on the tracked keys and writes one change_log row
 * per changed field. Call this in the same request as the update, after the
 * write succeeds, passing whichever of `before`/`after` are relevant.
 */
export async function recordChanges(
  recordType: "sample" | "batch",
  recordId: number,
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  changedBy: number | undefined,
): Promise<void> {
  const rows: (typeof changeLogTable.$inferInsert)[] = [];

  for (const field of Object.keys(after)) {
    if (!LOGGED_FIELDS.has(field)) continue;
    const oldValue = serialize(before[field]);
    const newValue = serialize(after[field]);
    if (oldValue === newValue) continue;
    rows.push({
      recordType,
      recordId,
      fieldName: field,
      oldValue,
      newValue,
      changedBy,
    });
  }

  if (rows.length > 0) {
    await db.insert(changeLogTable).values(rows);
  }
}
