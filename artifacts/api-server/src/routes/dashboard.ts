import { Router } from "express";
import { db, samplesTable, batchesTable, containerEventsTable } from "@workspace/db";
import { sql, eq, and, desc } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

const router = Router();

const targetBatchAlias = alias(batchesTable, "target_batch");
const targetSampleAlias = alias(samplesTable, "target_sample");

router.get("/dashboard/summary", async (_req, res) => {
  const [{ totalSamples }] = await db
    .select({ totalSamples: sql<number>`count(*)::int` })
    .from(samplesTable)
    .where(and(eq(samplesTable.archived, false), eq(samplesTable.voided, false)));

  const [{ totalBatches }] = await db
    .select({ totalBatches: sql<number>`count(*)::int` })
    .from(batchesTable)
    .where(eq(batchesTable.voided, false));

  const [{ contaminationAlerts }] = await db
    .select({ contaminationAlerts: sql<number>`count(*)::int` })
    .from(batchesTable)
    .where(and(eq(batchesTable.contaminationAlert, true), eq(batchesTable.voided, false)));

  const byStage = await db
    .select({ label: batchesTable.stage, count: sql<number>`count(*)::int` })
    .from(batchesTable)
    .where(eq(batchesTable.voided, false))
    .groupBy(batchesTable.stage);

  // Resolves source and target batches to sample_code + subcode, the same
  // way the batch detail page's History card does — the Dashboard spans
  // every sample, so unlike that page it can't rely on subcode alone being
  // unambiguous.
  const recentEvents = await db
    .select({
      id: containerEventsTable.id,
      eventType: containerEventsTable.eventType,
      quantity: containerEventsTable.quantity,
      reason: containerEventsTable.reason,
      eventDate: containerEventsTable.eventDate,
      createdAt: containerEventsTable.createdAt,
      sampleCode: samplesTable.sampleCode,
      subcode: batchesTable.subcode,
      targetSampleCode: targetSampleAlias.sampleCode,
      targetSubcode: targetBatchAlias.subcode,
    })
    .from(containerEventsTable)
    .innerJoin(batchesTable, eq(batchesTable.id, containerEventsTable.batchId))
    .innerJoin(samplesTable, eq(samplesTable.id, batchesTable.sampleId))
    .leftJoin(targetBatchAlias, eq(targetBatchAlias.id, containerEventsTable.targetBatchId))
    .leftJoin(targetSampleAlias, eq(targetSampleAlias.id, targetBatchAlias.sampleId))
    .where(eq(containerEventsTable.voided, false))
    .orderBy(desc(containerEventsTable.createdAt))
    .limit(5);

  res.json({
    totalSamples,
    totalBatches,
    contaminationAlerts,
    byStage,
    recentEvents,
  });
});

export default router;
