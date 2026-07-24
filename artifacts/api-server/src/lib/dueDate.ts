import { db, appSettingsTable, strainsTable, stageIntervalsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

/**
 * Global settings, every strain's renewal override, and every stage's
 * default interval, fetched once and reused across all rows being computed
 * in one request rather than per-row. Shared by every route that needs due
 * dates (batches, the variety summary, the schedule).
 */
export async function loadDueDateInputs() {
  const [settings, strainOverrides, stageIntervals] = await Promise.all([
    db.select().from(appSettingsTable).where(eq(appSettingsTable.id, 1)),
    db
      .select({ id: strainsTable.id, storageRenewalIntervalMonthsOverride: strainsTable.storageRenewalIntervalMonthsOverride })
      .from(strainsTable),
    db.select().from(stageIntervalsTable),
  ]);
  const overrideByStrainId = new Map(strainOverrides.map((s) => [s.id, s.storageRenewalIntervalMonthsOverride]));
  const globalMonths = settings[0]?.defaultStorageRenewalIntervalMonths ?? 6;
  const stageIntervalDays = new Map(stageIntervals.map((s) => [s.stage, s.intervalDays]));
  return { overrideByStrainId, globalMonths, stageIntervalDays };
}

/**
 * Precedence: per-batch override, then (for the storage stage only) the
 * strain's renewal-interval override in months, then the global months
 * default. Every other stage uses its own per-stage interval in days
 * (Settings-managed, seeded with placeholders) instead — there's no
 * per-strain override for those, only the admin-set default. A stage with
 * no configured interval returns null rather than inventing a number: an
 * absent due date is honest, a fabricated one looks authoritative and isn't.
 */
export function computeDueDate(
  batch: { transferDate: string; stage: string; dueDateOverride: string | null },
  strainRenewalMonthsOverride: number | null | undefined,
  globalStorageRenewalMonths: number,
  stageIntervalDays: Map<string, number>,
): string | null {
  if (batch.dueDateOverride) return batch.dueDateOverride;

  if (batch.stage === "long-term storage") {
    const months = strainRenewalMonthsOverride ?? globalStorageRenewalMonths;
    const d = new Date(`${batch.transferDate}T00:00:00Z`);
    d.setUTCMonth(d.getUTCMonth() + months);
    return d.toISOString().slice(0, 10);
  }

  const days = stageIntervalDays.get(batch.stage);
  if (days == null) return null;
  const d = new Date(`${batch.transferDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
