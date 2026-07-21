import { Router } from "express";
import { z } from "zod";
import {
  db,
  batchesTable,
  containerEventsTable,
  batchLineageTable,
  computedQuantitySql,
} from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { requireAdmin } from "../lib/auth";
import { nextSubcode } from "../lib/subcode";
import { computeInheritedContamination, RESCUE_CONTAMINATION_STATE, markHadContamination } from "../lib/contamination";
import { recordChanges } from "../lib/changeLog";

const router = Router();

const CONTAMINATED_REASON = "contaminated";

function batchRow() {
  return {
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
  };
}

async function loadBatchOr404(id: number, res: import("express").Response) {
  const [batch] = await db.select().from(batchesTable).where(eq(batchesTable.id, id));
  if (!batch) {
    res.status(404).json({ error: "Batch not found" });
    return null;
  }
  return batch;
}

router.get("/batches/:id", async (req, res) => {
  const id = z.coerce.number().parse(req.params.id);
  const [batch] = await db.select(batchRow()).from(batchesTable).where(eq(batchesTable.id, id));
  if (!batch) {
    res.status(404).json({ error: "Batch not found" });
    return;
  }
  res.json(batch);
});

router.get("/batches/:id/events", async (req, res) => {
  const id = z.coerce.number().parse(req.params.id);
  const events = await db
    .select()
    .from(containerEventsTable)
    .where(eq(containerEventsTable.batchId, id))
    .orderBy(desc(containerEventsTable.eventDate), desc(containerEventsTable.id));
  res.json(events);
});

router.get("/batches/:id/lineage", async (req, res) => {
  const id = z.coerce.number().parse(req.params.id);
  const parents = await db
    .select()
    .from(batchLineageTable)
    .where(eq(batchLineageTable.childBatchId, id));
  const children = await db
    .select()
    .from(batchLineageTable)
    .where(eq(batchLineageTable.parentBatchId, id));
  res.json({ parents, children });
});

const SubcultureOutput = z.object({
  consumedQuantity: z.number().int().positive(),
  producedQuantity: z.number().int().positive(),
  stage: z.string().min(1),
  medium: z.string().nullish(),
  containerType: z.string().nullish(),
  location: z.string().min(1),
  notes: z.string().nullish(),
  appearedCleanAtTransfer: z.boolean().optional(),
});

const SubcultureBody = z.object({
  transferDate: z.coerce.date(),
  outputs: z.array(SubcultureOutput).min(1),
});

router.post("/batches/:id/subculture", async (req, res) => {
  const id = z.coerce.number().parse(req.params.id);
  const body = SubcultureBody.parse(req.body);

  const source = await loadBatchOr404(id, res);
  if (!source) return;
  if (source.voided) {
    res.status(400).json({ error: "Cannot transfer from a voided batch" });
    return;
  }

  const [{ computedQuantity }] = await db
    .select({ computedQuantity: computedQuantitySql() })
    .from(batchesTable)
    .where(eq(batchesTable.id, id));
  const totalConsumed = body.outputs.reduce((sum, o) => sum + o.consumedQuantity, 0);
  if (totalConsumed > Number(computedQuantity)) {
    res.status(400).json({
      error: `Cannot consume ${totalConsumed} containers — only ${computedQuantity} available in this batch`,
    });
    return;
  }

  const transferDateStr = body.transferDate.toISOString().split("T")[0];

  const children = await db.transaction(async (tx) => {
    const created = [];
    for (const output of body.outputs) {
      const contamination = computeInheritedContamination(source, output.appearedCleanAtTransfer ?? true);
      const subcode = await nextSubcode(tx, source.sampleId);

      const [child] = await tx
        .insert(batchesTable)
        .values({
          sampleId: source.sampleId,
          subcode,
          stage: output.stage,
          transferDate: transferDateStr,
          medium: output.medium ?? source.medium,
          containerType: output.containerType ?? source.containerType,
          location: output.location,
          initialQuantity: output.producedQuantity,
          contaminationAlert: contamination.contaminationAlert,
          cleanTransferCount: contamination.cleanTransferCount,
          notes: output.notes ?? null,
          createdBy: req.currentUser!.id,
          updatedBy: req.currentUser!.id,
        })
        .returning();

      await tx.insert(containerEventsTable).values({
        batchId: source.id,
        eventType: "transfer_out",
        quantity: output.consumedQuantity,
        targetBatchId: child.id,
        eventDate: transferDateStr,
        createdBy: req.currentUser!.id,
      });

      await tx.insert(batchLineageTable).values({
        childBatchId: child.id,
        parentBatchId: source.id,
      });

      created.push(child);
    }
    return created;
  });

  res.status(201).json({ source: { id: source.id }, children });
});

const RescueBody = z.object({
  consumedQuantity: z.number().int().positive(),
  producedQuantity: z.number().int().positive(),
  stage: z.string().min(1),
  medium: z.string().nullish(),
  containerType: z.string().nullish(),
  location: z.string().min(1),
  transferDate: z.coerce.date(),
  notes: z.string().nullish(),
});

/**
 * Decontamination/rescue: a deliberate, distinct action from ordinary
 * subculture. The resulting batch always starts under suspicion
 * (contaminationAlert=true, cleanTransferCount=0) regardless of the
 * checkbox-driven inheritance math, and the source is marked as having
 * shown contamination.
 */
router.post("/batches/:id/rescue", async (req, res) => {
  const id = z.coerce.number().parse(req.params.id);
  const body = RescueBody.parse(req.body);

  const source = await loadBatchOr404(id, res);
  if (!source) return;
  if (source.voided) {
    res.status(400).json({ error: "Cannot rescue from a voided batch" });
    return;
  }

  const [{ computedQuantity }] = await db
    .select({ computedQuantity: computedQuantitySql() })
    .from(batchesTable)
    .where(eq(batchesTable.id, id));
  if (body.consumedQuantity > Number(computedQuantity)) {
    res.status(400).json({
      error: `Cannot consume ${body.consumedQuantity} containers — only ${computedQuantity} available in this batch`,
    });
    return;
  }

  const transferDateStr = body.transferDate.toISOString().split("T")[0];

  const child = await db.transaction(async (tx) => {
    const subcode = await nextSubcode(tx, source.sampleId);
    const [newBatch] = await tx
      .insert(batchesTable)
      .values({
        sampleId: source.sampleId,
        subcode,
        stage: body.stage,
        transferDate: transferDateStr,
        medium: body.medium ?? source.medium,
        containerType: body.containerType ?? source.containerType,
        location: body.location,
        initialQuantity: body.producedQuantity,
        ...RESCUE_CONTAMINATION_STATE,
        notes: body.notes ?? null,
        createdBy: req.currentUser!.id,
        updatedBy: req.currentUser!.id,
      })
      .returning();

    await tx.insert(containerEventsTable).values({
      batchId: source.id,
      eventType: "transfer_out",
      quantity: body.consumedQuantity,
      targetBatchId: newBatch.id,
      eventDate: transferDateStr,
      createdBy: req.currentUser!.id,
    });

    await tx.insert(batchLineageTable).values({
      childBatchId: newBatch.id,
      parentBatchId: source.id,
    });

    await markHadContamination(tx, source.id, req.currentUser!.id);

    return newBatch;
  });

  res.status(201).json({ source: { id: source.id }, child });
});

const DiscardBody = z.object({
  quantity: z.number().int().positive(),
  reason: z.string().min(1),
  eventDate: z.coerce.date(),
  note: z.string().nullish(),
});

router.post("/batches/:id/discard", async (req, res) => {
  const id = z.coerce.number().parse(req.params.id);
  const body = DiscardBody.parse(req.body);

  const batch = await loadBatchOr404(id, res);
  if (!batch) return;
  if (batch.voided) {
    res.status(400).json({ error: "Cannot record a discard against a voided batch" });
    return;
  }

  const [{ computedQuantity }] = await db
    .select({ computedQuantity: computedQuantitySql() })
    .from(batchesTable)
    .where(eq(batchesTable.id, id));
  if (body.quantity > Number(computedQuantity)) {
    res.status(400).json({
      error: `Cannot discard ${body.quantity} containers — only ${computedQuantity} available in this batch`,
    });
    return;
  }

  const isContaminated = body.reason.toLowerCase() === CONTAMINATED_REASON;

  const [event] = await db
    .insert(containerEventsTable)
    .values({
      batchId: id,
      eventType: "discard",
      quantity: body.quantity,
      reason: body.reason,
      eventDate: body.eventDate.toISOString().split("T")[0],
      note: body.note ?? null,
      createdBy: req.currentUser!.id,
    })
    .returning();

  // A contaminated discard never raises contamination_alert on this batch —
  // the alert is a forward-looking warning that only ever originates from a
  // rescue (POST /batches/:id/rescue). had_contamination is the permanent,
  // non-propagating record that this batch showed contamination.
  if (isContaminated) {
    await markHadContamination(db, id, req.currentUser!.id);
  }

  res.status(201).json(event);
});

const CorrectionBody = z.object({
  quantity: z.number().int().refine((v) => v !== 0, "Correction quantity cannot be zero"),
  reason: z.string().min(1),
  eventDate: z.coerce.date(),
  note: z.string().nullish(),
});

router.post("/batches/:id/correction", async (req, res) => {
  const id = z.coerce.number().parse(req.params.id);
  const body = CorrectionBody.parse(req.body);

  const batch = await loadBatchOr404(id, res);
  if (!batch) return;
  if (batch.voided) {
    res.status(400).json({ error: "Cannot record a correction against a voided batch" });
    return;
  }

  if (body.quantity < 0) {
    const [{ computedQuantity }] = await db
      .select({ computedQuantity: computedQuantitySql() })
      .from(batchesTable)
      .where(eq(batchesTable.id, id));
    if (Math.abs(body.quantity) > Number(computedQuantity)) {
      res.status(400).json({
        error: `Cannot correct by ${body.quantity} — only ${computedQuantity} available in this batch`,
      });
      return;
    }
  }

  const [event] = await db
    .insert(containerEventsTable)
    .values({
      batchId: id,
      eventType: "correction",
      quantity: body.quantity,
      reason: body.reason,
      eventDate: body.eventDate.toISOString().split("T")[0],
      note: body.note ?? null,
      createdBy: req.currentUser!.id,
    })
    .returning();

  res.status(201).json(event);
});

const ContaminationAlertBody = z.object({ alert: z.boolean(), reason: z.string().min(1) });

/**
 * Manual admin override of contaminationAlert — bypasses the normal
 * discard/rescue-derived path entirely, so unlike that path this always
 * requires an explicit reason (no automatic derivation to fall back on).
 * Admin-only; frontend must render this distinctly from alerts that arose
 * through discard/rescue (PR 2 — batch detail timeline).
 */
router.post("/batches/:id/contamination-alert", requireAdmin, async (req, res) => {
  const id = z.coerce.number().parse(req.params.id);
  const body = ContaminationAlertBody.parse(req.body);

  const [before] = await db.select().from(batchesTable).where(eq(batchesTable.id, id));
  if (!before) {
    res.status(404).json({ error: "Batch not found" });
    return;
  }

  const [after] = await db
    .update(batchesTable)
    .set({
      contaminationAlert: body.alert,
      cleanTransferCount: 0,
      updatedBy: req.currentUser!.id,
      updatedAt: new Date(),
    })
    .where(eq(batchesTable.id, id))
    .returning();

  await recordChanges(
    "batch",
    id,
    { contaminationAlert: before.contaminationAlert },
    { contaminationAlert: after.contaminationAlert },
    req.currentUser!.id,
    body.reason,
  );

  res.json(after);
});

router.post("/batches/:id/void", requireAdmin, async (req, res) => {
  const id = z.coerce.number().parse(req.params.id);
  const body = z.object({ reason: z.string().min(1) }).parse(req.body);
  const [batch] = await db
    .update(batchesTable)
    .set({ voided: true, voidedBy: req.currentUser!.id, voidedAt: new Date(), voidedReason: body.reason })
    .where(eq(batchesTable.id, id))
    .returning();
  if (!batch) {
    res.status(404).json({ error: "Batch not found" });
    return;
  }
  await recordChanges("batch", id, { voided: false }, { voided: true, voidedReason: body.reason }, req.currentUser!.id);
  res.json(batch);
});

router.post("/batches/:id/unvoid", requireAdmin, async (req, res) => {
  const id = z.coerce.number().parse(req.params.id);
  const [batch] = await db
    .update(batchesTable)
    .set({ voided: false, voidedBy: null, voidedAt: null, voidedReason: null })
    .where(eq(batchesTable.id, id))
    .returning();
  if (!batch) {
    res.status(404).json({ error: "Batch not found" });
    return;
  }
  await recordChanges("batch", id, { voided: true }, { voided: false }, req.currentUser!.id);
  res.json(batch);
});

router.post("/container-events/:id/void", requireAdmin, async (req, res) => {
  const id = z.coerce.number().parse(req.params.id);
  const body = z.object({ reason: z.string().min(1) }).parse(req.body);
  const [event] = await db
    .update(containerEventsTable)
    .set({ voided: true, voidedBy: req.currentUser!.id, voidedAt: new Date(), voidedReason: body.reason })
    .where(eq(containerEventsTable.id, id))
    .returning();
  if (!event) {
    res.status(404).json({ error: "Container event not found" });
    return;
  }
  res.json(event);
});

router.post("/container-events/:id/unvoid", requireAdmin, async (req, res) => {
  const id = z.coerce.number().parse(req.params.id);
  const [event] = await db
    .update(containerEventsTable)
    .set({ voided: false, voidedBy: null, voidedAt: null, voidedReason: null })
    .where(eq(containerEventsTable.id, id))
    .returning();
  if (!event) {
    res.status(404).json({ error: "Container event not found" });
    return;
  }
  res.json(event);
});

export default router;
