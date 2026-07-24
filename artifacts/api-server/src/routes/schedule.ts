import { Router } from "express";
import { z } from "zod";
import { db, batchesTable, samplesTable, varietiesTable, strainsTable, computedQuantitySql } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { loadDueDateInputs, computeDueDate } from "../lib/dueDate";

const router = Router();

const ScheduleQuery = z.object({
  stage: z.string().optional(),
  location: z.string().optional(),
});

/**
 * Batches with a computed due date, excluding depleted batches, voided
 * batches, and batches belonging to archived or voided samples — none of
 * those need attention, so they'd just be noise on a page whose purpose is
 * "what needs doing." A batch whose stage has no configured interval and no
 * override has no due date at all and is excluded too, rather than sorting
 * in as an undated row: there's nothing to schedule it against.
 */
router.get("/schedule", async (req, res) => {
  const query = ScheduleQuery.parse(req.query);
  const conditions = [eq(batchesTable.voided, false), eq(samplesTable.voided, false), eq(samplesTable.archived, false)];
  if (query.stage) conditions.push(eq(batchesTable.stage, query.stage));
  if (query.location) conditions.push(eq(batchesTable.location, query.location));

  const [rows, { overrideByStrainId, globalMonths, stageIntervalDays }] = await Promise.all([
    db
      .select({
        id: batchesTable.id,
        sampleId: batchesTable.sampleId,
        sampleCode: samplesTable.sampleCode,
        subcode: batchesTable.subcode,
        varietyLabel: varietiesTable.label,
        strainLabel: strainsTable.label,
        strainId: samplesTable.strainId,
        stage: batchesTable.stage,
        location: batchesTable.location,
        transferDate: batchesTable.transferDate,
        dueDateOverride: batchesTable.dueDateOverride,
        computedQuantity: computedQuantitySql(),
        contaminationAlert: batchesTable.contaminationAlert,
        notes: batchesTable.notes,
      })
      .from(batchesTable)
      .innerJoin(samplesTable, eq(samplesTable.id, batchesTable.sampleId))
      .leftJoin(varietiesTable, eq(varietiesTable.id, samplesTable.varietyId))
      .leftJoin(strainsTable, eq(strainsTable.id, samplesTable.strainId))
      .where(and(...conditions)),
    loadDueDateInputs(),
  ]);

  const today = new Date().toISOString().slice(0, 10);

  const scheduled = rows
    .filter((b) => Number(b.computedQuantity) > 0)
    .map((b) => ({
      ...b,
      computedDueDate: computeDueDate(b, b.strainId ? overrideByStrainId.get(b.strainId) : null, globalMonths, stageIntervalDays),
    }))
    .filter((b): b is typeof b & { computedDueDate: string } => b.computedDueDate !== null)
    .map((b) => ({ ...b, isOverdue: b.computedDueDate < today }))
    .sort((a, b) => a.computedDueDate.localeCompare(b.computedDueDate));

  res.json(scheduled);
});

export default router;
