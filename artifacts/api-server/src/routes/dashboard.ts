import { Router } from "express";
import { db, samplesTable, transfersTable } from "@workspace/db";
import { sql, desc, eq, isNotNull, and, lte, asc } from "drizzle-orm";
import { GetScheduleQueryParams } from "@workspace/api-zod";

const router = Router();

router.get("/schedule", async (req, res) => {
  const query = GetScheduleQueryParams.parse(req.query);
  const daysAhead = query.days ?? 60;

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() + daysAhead);
  const cutoffStr = cutoff.toISOString().split("T")[0];
  const todayStr = new Date().toISOString().split("T")[0];

  const rows = await db
    .select()
    .from(samplesTable)
    .where(
      and(
        isNotNull(samplesTable.nextActionDate),
        lte(samplesTable.nextActionDate, cutoffStr),
      ),
    )
    .orderBy(asc(samplesTable.nextActionDate));

  const results = rows.map((s) => {
    const actionDate = new Date(s.nextActionDate!);
    const today = new Date(todayStr);
    const diffMs = actionDate.getTime() - today.getTime();
    const daysUntilAction = Math.round(diffMs / (1000 * 60 * 60 * 24));
    return {
      ...s,
      nextActionDate: s.nextActionDate!,
      daysUntilAction,
    };
  });

  res.json(results);
});

router.get("/dashboard/summary", async (req, res) => {
  const [{ totalSamples }] = await db
    .select({ totalSamples: sql<number>`count(*)::int` })
    .from(samplesTable);

  const [{ totalTransfers }] = await db
    .select({ totalTransfers: sql<number>`count(*)::int` })
    .from(transfersTable);

  const byStatus = await db
    .select({
      label: samplesTable.status,
      count: sql<number>`count(*)::int`,
    })
    .from(samplesTable)
    .groupBy(samplesTable.status);

  const byStage = await db
    .select({
      label: samplesTable.stage,
      count: sql<number>`count(*)::int`,
    })
    .from(samplesTable)
    .groupBy(samplesTable.stage);

  const fromAlias = db
    .select({ id: samplesTable.id, sampleCode: samplesTable.sampleCode })
    .from(samplesTable)
    .as("from_sample");

  const toAlias = db
    .select({ id: samplesTable.id, sampleCode: samplesTable.sampleCode })
    .from(samplesTable)
    .as("to_sample");

  const recentTransfers = await db
    .select({
      id: transfersTable.id,
      fromSampleId: transfersTable.fromSampleId,
      toSampleId: transfersTable.toSampleId,
      fromSampleCode: fromAlias.sampleCode,
      toSampleCode: toAlias.sampleCode,
      transferDate: transfersTable.transferDate,
      fromLocation: transfersTable.fromLocation,
      toLocation: transfersTable.toLocation,
      mediaType: transfersTable.mediaType,
      quantityTransferred: transfersTable.quantityTransferred,
      technician: transfersTable.technician,
      notes: transfersTable.notes,
      createdAt: transfersTable.createdAt,
    })
    .from(transfersTable)
    .leftJoin(fromAlias, eq(transfersTable.fromSampleId, fromAlias.id))
    .leftJoin(toAlias, eq(transfersTable.toSampleId, toAlias.id))
    .orderBy(desc(transfersTable.createdAt))
    .limit(5);

  res.json({
    totalSamples,
    totalTransfers,
    byStatus,
    byStage,
    recentTransfers,
  });
});

export default router;
