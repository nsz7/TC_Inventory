import { batchesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import type { DbOrTx } from "./subcode";

/**
 * Computes a new batch's contamination_alert/clean_transfer_count when it's
 * created via an ordinary subculture (not a rescue — rescue always forces
 * alert=true, count=0 regardless of this logic).
 *
 * If the parent has no alert, there's nothing to inherit or clear.
 * If the parent has an alert, the person transferring judges the source at
 * that moment ("source appeared clean at transfer", pre-ticked):
 *   - ticked: streak continues. Two consecutive clean transfers clears it.
 *   - unticked: streak resets to 0, alert stays raised.
 */
export function computeInheritedContamination(
  parent: { contaminationAlert: boolean; cleanTransferCount: number },
  appearedCleanAtTransfer: boolean,
): { contaminationAlert: boolean; cleanTransferCount: number } {
  if (!parent.contaminationAlert) {
    return { contaminationAlert: false, cleanTransferCount: 0 };
  }

  if (!appearedCleanAtTransfer) {
    return { contaminationAlert: true, cleanTransferCount: 0 };
  }

  const newCount = parent.cleanTransferCount + 1;
  if (newCount >= 2) {
    return { contaminationAlert: false, cleanTransferCount: 0 };
  }
  return { contaminationAlert: true, cleanTransferCount: newCount };
}

/** A rescue/decontamination result always starts under suspicion, streak reset. */
export const RESCUE_CONTAMINATION_STATE = { contaminationAlert: true, cleanTransferCount: 0 } as const;

/**
 * Sets had_contamination on a batch, but only if it isn't already true.
 * Both a contaminated discard and a rescue set this on the batch where
 * contamination was actually observed, and the same batch can accumulate
 * both kinds of events over its life (e.g. discard some contaminated
 * containers, then separately rescue another one, in the same session).
 * Without this guard, the second write would silently re-stamp
 * updated_by/updated_at even though nothing about the batch's state
 * actually changed — misattributing "who last touched this record" to
 * whoever happened to trigger the second event.
 */
export async function markHadContamination(tx: DbOrTx, batchId: number, updatedBy: number): Promise<void> {
  const [batch] = await tx.select({ hadContamination: batchesTable.hadContamination }).from(batchesTable).where(eq(batchesTable.id, batchId));
  if (batch?.hadContamination) return;

  await tx
    .update(batchesTable)
    .set({ hadContamination: true, updatedBy, updatedAt: new Date() })
    .where(eq(batchesTable.id, batchId));
}
