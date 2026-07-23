import { Router } from "express";
import { z } from "zod";
import {
  db,
  samplesTable,
  batchesTable,
  varietiesTable,
  strainsTable,
  computedQuantitySql,
} from "@workspace/db";
import { eq, and, or, ilike, sql } from "drizzle-orm";
import { requireAdmin } from "../lib/auth";
import { buildSampleCode, nextSerial } from "../lib/sampleCode";
import { nextSubcode } from "../lib/subcode";
import { recordChanges } from "../lib/changeLog";

const router = Router();

// Display-only: a contamination event anywhere in this sample's batches
// should be visible from the collapsed row, without implying an active
// alert (that stays per-batch, shown only on expand). Never propagates
// beyond "did this happen somewhere under this sample" — the batch detail
// page is still the only place showing which batch it actually was.
function hadContaminationRollupSql() {
  return sql<boolean>`exists(
    select 1 from batches b
    where b.sample_id = "samples"."id" and b.had_contamination = true and b.voided = false
  )`;
}

const sampleColumns = {
  id: samplesTable.id,
  sampleCode: samplesTable.sampleCode,
  categoryCode: samplesTable.categoryCode,
  year: samplesTable.year,
  serial: samplesTable.serial,
  varietyId: samplesTable.varietyId,
  varietyLabel: varietiesTable.label,
  strainId: samplesTable.strainId,
  strainLabel: strainsTable.label,
  archived: samplesTable.archived,
  archivedReason: samplesTable.archivedReason,
  voided: samplesTable.voided,
  voidedReason: samplesTable.voidedReason,
  hadContaminationRollup: hadContaminationRollupSql(),
  createdAt: samplesTable.createdAt,
  updatedAt: samplesTable.updatedAt,
};

function sampleBaseQuery() {
  return db
    .select(sampleColumns)
    .from(samplesTable)
    .leftJoin(varietiesTable, eq(samplesTable.varietyId, varietiesTable.id))
    .leftJoin(strainsTable, eq(samplesTable.strainId, strainsTable.id));
}

const ListSamplesQuery = z.object({
  search: z.string().optional(),
  varietyId: z.coerce.number().optional(),
  includeArchived: z.coerce.boolean().optional().default(false),
  includeVoided: z.coerce.boolean().optional().default(false),
});

router.get("/samples", async (req, res) => {
  const query = ListSamplesQuery.parse(req.query);
  const conditions = [];

  if (!query.includeArchived) conditions.push(eq(samplesTable.archived, false));
  if (!query.includeVoided) conditions.push(eq(samplesTable.voided, false));
  if (query.varietyId !== undefined) conditions.push(eq(samplesTable.varietyId, query.varietyId));
  if (query.search) {
    conditions.push(
      or(ilike(samplesTable.sampleCode, `%${query.search}%`), ilike(varietiesTable.label, `%${query.search}%`)),
    );
  }

  const samples = await sampleBaseQuery().where(conditions.length > 0 ? and(...conditions) : undefined);
  res.json(samples);
});

const CreateSampleBody = z.object({
  categoryCode: z.string().length(2).regex(/^[A-Za-z]{2}$/, "Category code must be two letters"),
  varietyId: z.number(),
  // Required at creation so per-strain min-stock/renewal overrides and the
  // variety page's aggregation always have something to attach to — every
  // variety is seeded with at least one strain (a plain "Standard" one for
  // varieties the lab doesn't distinguish within) to keep this satisfiable.
  strainId: z.number(),
  // The initiation batch, created atomically with the sample.
  location: z.string().min(1),
  transferDate: z.coerce.date(),
  medium: z.string().nullish(),
  containerType: z.string().nullish(),
  initialQuantity: z.number().int().positive(),
  notes: z.string().nullish(),
});

router.post("/samples", async (req, res) => {
  const body = CreateSampleBody.parse(req.body);
  const categoryCode = body.categoryCode.toUpperCase();
  const year = String(new Date().getUTCFullYear() % 100).padStart(2, "0");

  const result = await db.transaction(async (tx) => {
    const serial = await nextSerial(tx, categoryCode, year);
    const sampleCode = buildSampleCode(categoryCode, year, serial);

    const [sample] = await tx
      .insert(samplesTable)
      .values({
        sampleCode,
        categoryCode,
        year,
        serial,
        varietyId: body.varietyId,
        strainId: body.strainId ?? null,
        createdBy: req.currentUser!.id,
        updatedBy: req.currentUser!.id,
      })
      .returning();

    const subcode = await nextSubcode(tx, sample.id);
    const [batch] = await tx
      .insert(batchesTable)
      .values({
        sampleId: sample.id,
        subcode,
        stage: "initiation",
        transferDate: body.transferDate.toISOString().split("T")[0],
        medium: body.medium ?? null,
        containerType: body.containerType ?? null,
        location: body.location,
        initialQuantity: body.initialQuantity,
        notes: body.notes ?? null,
        createdBy: req.currentUser!.id,
        updatedBy: req.currentUser!.id,
      })
      .returning();

    return { sample, batch };
  });

  res.status(201).json(result);
});

router.get("/samples/:id", async (req, res) => {
  const id = z.coerce.number().parse(req.params.id);
  const [sample] = await sampleBaseQuery().where(eq(samplesTable.id, id));
  if (!sample) {
    res.status(404).json({ error: "Sample not found" });
    return;
  }
  res.json(sample);
});

router.get("/samples/:id/batches", async (req, res) => {
  const id = z.coerce.number().parse(req.params.id);
  const batches = await db
    .select({
      id: batchesTable.id,
      sampleId: batchesTable.sampleId,
      subcode: batchesTable.subcode,
      stage: batchesTable.stage,
      transferDate: batchesTable.transferDate,
      medium: batchesTable.medium,
      containerType: batchesTable.containerType,
      location: batchesTable.location,
      initialQuantity: batchesTable.initialQuantity,
      computedQuantity: computedQuantitySql(),
      contaminationAlert: batchesTable.contaminationAlert,
      cleanTransferCount: batchesTable.cleanTransferCount,
      hadContamination: batchesTable.hadContamination,
      notes: batchesTable.notes,
      voided: batchesTable.voided,
      voidedReason: batchesTable.voidedReason,
      createdAt: batchesTable.createdAt,
    })
    .from(batchesTable)
    .where(eq(batchesTable.sampleId, id));
  res.json(batches);
});

const UpdateSampleBody = z.object({
  varietyId: z.number().optional(),
  strainId: z.number().nullish(),
});

router.patch("/samples/:id", async (req, res) => {
  const id = z.coerce.number().parse(req.params.id);
  const body = UpdateSampleBody.parse(req.body);

  const [before] = await db.select().from(samplesTable).where(eq(samplesTable.id, id));
  if (!before) {
    res.status(404).json({ error: "Sample not found" });
    return;
  }

  const [after] = await db
    .update(samplesTable)
    .set({ ...body, updatedBy: req.currentUser!.id, updatedAt: new Date() })
    .where(eq(samplesTable.id, id))
    .returning();

  await recordChanges(
    "sample",
    id,
    { variety: before.varietyId, strain: before.strainId },
    { variety: after.varietyId, strain: after.strainId },
    req.currentUser!.id,
  );

  res.json(after);
});

const ArchiveBody = z.object({ reason: z.string().min(1) });

router.post("/samples/:id/archive", requireAdmin, async (req, res) => {
  const id = z.coerce.number().parse(req.params.id);
  const body = ArchiveBody.parse(req.body);
  const [sample] = await db
    .update(samplesTable)
    .set({
      archived: true,
      archivedBy: req.currentUser!.id,
      archivedAt: new Date(),
      archivedReason: body.reason,
    })
    .where(eq(samplesTable.id, id))
    .returning();
  if (!sample) {
    res.status(404).json({ error: "Sample not found" });
    return;
  }
  await recordChanges("sample", id, { archived: false }, { archived: true, archivedReason: body.reason }, req.currentUser!.id);
  res.json(sample);
});

router.post("/samples/:id/unarchive", requireAdmin, async (req, res) => {
  const id = z.coerce.number().parse(req.params.id);
  const [sample] = await db
    .update(samplesTable)
    .set({ archived: false, archivedBy: null, archivedAt: null, archivedReason: null })
    .where(eq(samplesTable.id, id))
    .returning();
  if (!sample) {
    res.status(404).json({ error: "Sample not found" });
    return;
  }
  await recordChanges("sample", id, { archived: true }, { archived: false }, req.currentUser!.id);
  res.json(sample);
});

const VoidBody = z.object({ reason: z.string().min(1) });

router.post("/samples/:id/void", requireAdmin, async (req, res) => {
  const id = z.coerce.number().parse(req.params.id);
  const body = VoidBody.parse(req.body);
  const [sample] = await db
    .update(samplesTable)
    .set({ voided: true, voidedBy: req.currentUser!.id, voidedAt: new Date(), voidedReason: body.reason })
    .where(eq(samplesTable.id, id))
    .returning();
  if (!sample) {
    res.status(404).json({ error: "Sample not found" });
    return;
  }
  await recordChanges("sample", id, { voided: false }, { voided: true, voidedReason: body.reason }, req.currentUser!.id);
  res.json(sample);
});

router.post("/samples/:id/unvoid", requireAdmin, async (req, res) => {
  const id = z.coerce.number().parse(req.params.id);
  const [sample] = await db
    .update(samplesTable)
    .set({ voided: false, voidedBy: null, voidedAt: null, voidedReason: null })
    .where(eq(samplesTable.id, id))
    .returning();
  if (!sample) {
    res.status(404).json({ error: "Sample not found" });
    return;
  }
  await recordChanges("sample", id, { voided: true }, { voided: false }, req.currentUser!.id);
  res.json(sample);
});

export default router;
