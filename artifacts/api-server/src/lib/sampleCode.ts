import { db, samplesTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import type { DbOrTx } from "./subcode";

/** Canonical format: two-letter category + two-digit year + "_" + three-digit serial, e.g. FA26_001. */
export const SAMPLE_CODE_PATTERN = /^[A-Z]{2}\d{2}_\d{3}$/;
/** Canonical batch code format for display/search: FA26_001-01. */
export const BATCH_CODE_PATTERN = /^[A-Z]{2}\d{2}_\d{3}-\d{2}$/;

export function isValidSampleCode(code: string): boolean {
  return SAMPLE_CODE_PATTERN.test(code);
}

/** Serial resets per category code per year — must run in the same transaction as the sample insert. */
export async function nextSerial(tx: DbOrTx, categoryCode: string, year: string): Promise<number> {
  const existing = await tx
    .select({ serial: samplesTable.serial })
    .from(samplesTable)
    .where(and(eq(samplesTable.categoryCode, categoryCode), eq(samplesTable.year, year)));

  return existing.reduce((max, row) => Math.max(max, row.serial), 0) + 1;
}

export function buildSampleCode(categoryCode: string, year: string, serial: number): string {
  return `${categoryCode}${year}_${String(serial).padStart(3, "0")}`;
}

export function buildBatchDisplayCode(sampleCode: string, subcode: string): string {
  return `${sampleCode}-${subcode}`;
}
