import { Router } from "express";
import { db, samplesTable, batchesTable, containerEventsTable } from "@workspace/db";
import { sql, eq, and, desc } from "drizzle-orm";

const router = Router();

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

  const recentEvents = await db
    .select({
      id: containerEventsTable.id,
      batchId: containerEventsTable.batchId,
      eventType: containerEventsTable.eventType,
      quantity: containerEventsTable.quantity,
      reason: containerEventsTable.reason,
      targetBatchId: containerEventsTable.targetBatchId,
      eventDate: containerEventsTable.eventDate,
      createdAt: containerEventsTable.createdAt,
    })
    .from(containerEventsTable)
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
