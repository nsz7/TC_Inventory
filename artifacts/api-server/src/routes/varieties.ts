import { Router } from "express";
import { z } from "zod";
import { db, varietiesTable, strainsTable, samplesTable, batchesTable, appSettingsTable, computedQuantitySql } from "@workspace/db";
import { eq, asc } from "drizzle-orm";
import { requireAdmin } from "../lib/auth";

const router = Router();

const ListQuery = z.object({ includeInactive: z.coerce.boolean().optional().default(false) });

router.get("/varieties", async (req, res) => {
  const query = ListQuery.parse(req.query);
  const rows = await db
    .select()
    .from(varietiesTable)
    .where(query.includeInactive ? undefined : eq(varietiesTable.active, true))
    .orderBy(asc(varietiesTable.label));
  res.json(rows);
});

const STORAGE_STAGE = "long-term storage";

/**
 * The variety -> strain -> sample tree for the summary page, aggregated
 * here rather than client-side because minimum-stock and storage-age are
 * threshold comparisons against resolved (override-or-global) settings —
 * the same "compute it once, server-side, never duplicate the logic in the
 * frontend" rule as computedQuantity and computedDueDate. Excludes voided
 * batches always and archived samples' batches from the counts: an
 * archived sample is retired, so its stock shouldn't read as current
 * holdings needing restocking.
 */
router.get("/varieties/summary", async (_req, res) => {
  const [varieties, strains, samples, batches, settingsRows] = await Promise.all([
    db.select().from(varietiesTable).where(eq(varietiesTable.active, true)).orderBy(asc(varietiesTable.label)),
    db.select().from(strainsTable).where(eq(strainsTable.active, true)).orderBy(asc(strainsTable.label)),
    db
      .select({
        id: samplesTable.id,
        sampleCode: samplesTable.sampleCode,
        varietyId: samplesTable.varietyId,
        strainId: samplesTable.strainId,
        archived: samplesTable.archived,
      })
      .from(samplesTable)
      .where(eq(samplesTable.voided, false)),
    db
      .select({
        sampleId: batchesTable.sampleId,
        stage: batchesTable.stage,
        transferDate: batchesTable.transferDate,
        computedQuantity: computedQuantitySql(),
      })
      .from(batchesTable)
      .where(eq(batchesTable.voided, false)),
    db.select().from(appSettingsTable).where(eq(appSettingsTable.id, 1)),
  ]);

  const globalMinStock = settingsRows[0]?.defaultMinStorageStock ?? 5;
  const globalRenewalMonths = settingsRows[0]?.defaultStorageRenewalIntervalMonths ?? 6;
  const today = new Date().toISOString().slice(0, 10);

  const activeSamples = samples.filter((s) => !s.archived);
  const batchesBySampleId = new Map<number, typeof batches>();
  for (const b of batches) {
    batchesBySampleId.set(b.sampleId, [...(batchesBySampleId.get(b.sampleId) ?? []), b]);
  }

  function stageTotalsOf(sampleIds: number[]) {
    const totals: Record<string, number> = {};
    for (const sampleId of sampleIds) {
      for (const b of batchesBySampleId.get(sampleId) ?? []) {
        totals[b.stage] = (totals[b.stage] ?? 0) + Number(b.computedQuantity);
      }
    }
    return totals;
  }

  function renewalDueDate(transferDate: string, months: number) {
    const d = new Date(`${transferDate}T00:00:00Z`);
    d.setUTCMonth(d.getUTCMonth() + months);
    return d.toISOString().slice(0, 10);
  }

  const result = varieties.map((variety) => {
    const varietyStrains = strains.filter((s) => s.varietyId === variety.id);
    const varietySampleIds = activeSamples.filter((s) => s.varietyId === variety.id).map((s) => s.id);

    const strainRows = varietyStrains.map((strain) => {
      const strainSamples = activeSamples.filter((s) => s.strainId === strain.id);
      const strainSampleIds = strainSamples.map((s) => s.id);
      const stageTotals = stageTotalsOf(strainSampleIds);

      const minStorageStock = strain.minStorageStockOverride ?? globalMinStock;
      const renewalMonths = strain.storageRenewalIntervalMonthsOverride ?? globalRenewalMonths;
      const storageCount = stageTotals[STORAGE_STAGE] ?? 0;

      const storageBatchDates = strainSampleIds
        .flatMap((id) => batchesBySampleId.get(id) ?? [])
        .filter((b) => b.stage === STORAGE_STAGE)
        .map((b) => b.transferDate)
        .sort();
      const oldestStorageTransferDate = storageBatchDates[0] ?? null;
      const storageAgeDays = oldestStorageTransferDate
        ? Math.floor((Date.parse(today) - Date.parse(oldestStorageTransferDate)) / 86_400_000)
        : null;
      const isOverdueForRenewal = oldestStorageTransferDate
        ? renewalDueDate(oldestStorageTransferDate, renewalMonths) < today
        : false;

      return {
        id: strain.id,
        label: strain.label,
        stageTotals,
        minStorageStock,
        minStorageStockIsOverride: strain.minStorageStockOverride != null,
        renewalMonths,
        renewalMonthsIsOverride: strain.storageRenewalIntervalMonthsOverride != null,
        belowMinimumStock: storageCount < minStorageStock,
        oldestStorageTransferDate,
        storageAgeDays,
        isOverdueForRenewal,
        samples: strainSamples.map((s) => ({
          id: s.id,
          sampleCode: s.sampleCode,
          stageTotals: stageTotalsOf([s.id]),
        })),
      };
    });

    return {
      id: variety.id,
      label: variety.label,
      stageTotals: stageTotalsOf(varietySampleIds),
      strains: strainRows,
    };
  });

  res.json(result);
});

const CreateBody = z.object({ label: z.string().min(1) });

// Any authenticated user can add a variety inline while creating a sample.
router.post("/varieties", async (req, res) => {
  const body = CreateBody.parse(req.body);
  const [created] = await db.insert(varietiesTable).values({ label: body.label }).returning();
  res.status(201).json(created);
});

const UpdateBody = z.object({ label: z.string().min(1).optional(), active: z.boolean().optional() });

router.patch("/varieties/:id", requireAdmin, async (req, res) => {
  const id = z.coerce.number().parse(req.params.id);
  const body = UpdateBody.parse(req.body);
  const [updated] = await db.update(varietiesTable).set(body).where(eq(varietiesTable.id, id)).returning();
  if (!updated) {
    res.status(404).json({ error: "Variety not found" });
    return;
  }
  res.json(updated);
});

export default router;
