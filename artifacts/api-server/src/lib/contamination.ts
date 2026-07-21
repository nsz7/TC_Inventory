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
