import "./env";
import {
  db,
  pool,
  samplesTable,
  batchesTable,
  containerEventsTable,
  batchLineageTable,
  computedQuantitySql,
} from "@workspace/db";
import { asc, eq } from "drizzle-orm";

/**
 * Read-only report over the seeded database: for every batch, prints its
 * identity, the container_events that built its computed count, the
 * computed count itself, and its contamination/lineage state. Exists so a
 * human can check the event-sourced quantity math and the contamination
 * inheritance/clearing rules by eye before any UI is built on top of them.
 */
async function main() {
  const batches = await db
    .select({
      id: batchesTable.id,
      sampleId: batchesTable.sampleId,
      sampleCode: samplesTable.sampleCode,
      subcode: batchesTable.subcode,
      stage: batchesTable.stage,
      transferDate: batchesTable.transferDate,
      initialQuantity: batchesTable.initialQuantity,
      computedQuantity: computedQuantitySql(),
      contaminationAlert: batchesTable.contaminationAlert,
      cleanTransferCount: batchesTable.cleanTransferCount,
      hadContamination: batchesTable.hadContamination,
      voided: batchesTable.voided,
    })
    .from(batchesTable)
    .innerJoin(samplesTable, eq(samplesTable.id, batchesTable.sampleId))
    .orderBy(asc(samplesTable.sampleCode), asc(batchesTable.subcode));

  for (const batch of batches) {
    const code = `${batch.sampleCode}-${batch.subcode}`;
    const events = await db
      .select({
        id: containerEventsTable.id,
        eventType: containerEventsTable.eventType,
        quantity: containerEventsTable.quantity,
        reason: containerEventsTable.reason,
        targetBatchId: containerEventsTable.targetBatchId,
        eventDate: containerEventsTable.eventDate,
        voided: containerEventsTable.voided,
      })
      .from(containerEventsTable)
      .where(eq(containerEventsTable.batchId, batch.id))
      .orderBy(asc(containerEventsTable.id));

    const parents = await db
      .select({ parentBatchId: batchLineageTable.parentBatchId })
      .from(batchLineageTable)
      .where(eq(batchLineageTable.childBatchId, batch.id));

    console.log(`\n=== Batch #${batch.id}  ${code}  (stage: ${batch.stage}, transferred: ${batch.transferDate}) ===`);
    console.log(`  initial_quantity: ${batch.initialQuantity}`);
    if (events.length === 0) {
      console.log(`  container_events: (none)`);
    } else {
      console.log(`  container_events:`);
      for (const e of events) {
        const voidedTag = e.voided ? " [VOIDED]" : "";
        const target = e.targetBatchId ? ` -> batch #${e.targetBatchId}` : "";
        const reason = e.reason ? ` (${e.reason})` : "";
        console.log(`    #${e.id}  ${e.eventType} qty=${e.quantity}${target}${reason}  ${e.eventDate}${voidedTag}`);
      }
    }
    console.log(`  computed_current_count: ${batch.computedQuantity}`);
    console.log(`  contamination_alert: ${batch.contaminationAlert}`);
    console.log(`  clean_transfer_count: ${batch.cleanTransferCount}`);
    console.log(`  had_contamination: ${batch.hadContamination}`);
    console.log(`  voided: ${batch.voided}`);
    console.log(
      `  parent_batch_ids: ${parents.length === 0 ? "(none — initiation)" : parents.map((p) => p.parentBatchId).join(", ")}`,
    );
  }

  console.log(`\n${batches.length} batches total.`);
}

main()
  .then(async () => {
    await pool.end();
  })
  .catch(async (err) => {
    console.error(err);
    await pool.end();
    process.exit(1);
  });
