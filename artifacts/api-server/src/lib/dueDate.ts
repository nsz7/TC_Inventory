/**
 * Precedence: per-batch override, then (for the storage stage only) the
 * strain's renewal-interval override, then the global default. Non-storage
 * stages have no per-stage default yet — that's Settings/PR3 work, seeded
 * with placeholders the owner must review. Returning null here rather than
 * inventing a number is deliberate: an absent due date is honest, a
 * fabricated one looks authoritative and isn't.
 */
export function computeDueDate(
  batch: { transferDate: string; stage: string; dueDateOverride: string | null },
  strainRenewalMonthsOverride: number | null | undefined,
  globalStorageRenewalMonths: number,
): string | null {
  if (batch.dueDateOverride) return batch.dueDateOverride;
  if (batch.stage !== "long-term storage") return null;

  const months = strainRenewalMonthsOverride ?? globalStorageRenewalMonths;
  const d = new Date(`${batch.transferDate}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.toISOString().slice(0, 10);
}
