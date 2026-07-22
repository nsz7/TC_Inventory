import { containerEventsTable } from "@workspace/db";
import type { DbOrTx } from "./subcode";
import { markHadContamination } from "./contamination";

const CONTAMINATED_REASON = "contaminated";

/**
 * The one mechanism behind every discard, whatever triggers it — the
 * standalone discard action and the transfer dialog's "close out source"
 * checkbox must produce identical container_events rows and identical
 * had_contamination handling, not two parallel implementations of the same
 * event.
 */
export async function recordDiscard(
  tx: DbOrTx,
  params: {
    batchId: number;
    quantity: number;
    reason: string;
    eventDate: string;
    note?: string | null;
    userId: number;
  },
) {
  const [event] = await tx
    .insert(containerEventsTable)
    .values({
      batchId: params.batchId,
      eventType: "discard",
      quantity: params.quantity,
      reason: params.reason,
      eventDate: params.eventDate,
      note: params.note ?? null,
      createdBy: params.userId,
    })
    .returning();

  if (params.reason.toLowerCase() === CONTAMINATED_REASON) {
    await markHadContamination(tx, params.batchId, params.userId);
  }

  return event;
}
