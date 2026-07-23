import { Router } from "express";
import { z } from "zod";
import {
  db,
  batchesTable,
  samplesTable,
  varietiesTable,
  strainsTable,
  usersTable,
  containerEventsTable,
  batchLineageTable,
  changeLogTable,
  appSettingsTable,
  computedQuantitySql,
} from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { requireAdmin } from "../lib/auth";
import { nextSubcode } from "../lib/subcode";
import { computeInheritedContamination, RESCUE_CONTAMINATION_STATE, markHadContamination } from "../lib/contamination";
import { recordDiscard } from "../lib/discard";
import { recordChanges } from "../lib/changeLog";
import { computeDueDate } from "../lib/dueDate";

const router = Router();

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
    dueDateOverride: batchesTable.dueDateOverride,
    voided: batchesTable.voided,
    voidedReason: batchesTable.voidedReason,
    createdAt: batchesTable.createdAt,
  };
}

/** Global settings and every strain's renewal override, fetched once and
 * reused across all rows being computed in one request rather than
 * per-row. */
async function loadDueDateInputs() {
  const [settings] = await db.select().from(appSettingsTable).where(eq(appSettingsTable.id, 1));
  const strainOverrides = await db
    .select({ id: strainsTable.id, storageRenewalIntervalMonthsOverride: strainsTable.storageRenewalIntervalMonthsOverride })
    .from(strainsTable);
  const overrideByStrainId = new Map(strainOverrides.map((s) => [s.id, s.storageRenewalIntervalMonthsOverride]));
  const globalMonths = settings?.defaultStorageRenewalIntervalMonths ?? 6;
  return { overrideByStrainId, globalMonths };
}

async function loadBatchOr404(id: number, res: import("express").Response) {
  const [batch] = await db.select().from(batchesTable).where(eq(batchesTable.id, id));
  if (!batch) {
    res.status(404).json({ error: "Batch not found" });
    return null;
  }
  return batch;
}

const ListBatchesQuery = z.object({
  includeVoided: z.coerce.boolean().optional().default(false),
});

// Powers the samples compact table's stage-pivot columns: fetched once for
// all samples rather than per-sample, since the table needs every sample's
// batches to aggregate. sampleCode included so the frontend doesn't need a
// second round trip to label rows.
router.get("/batches", async (req, res) => {
  const query = ListBatchesQuery.parse(req.query);
  const conditions = [];
  if (!query.includeVoided) conditions.push(eq(batchesTable.voided, false));

  const [batches, { overrideByStrainId, globalMonths }] = await Promise.all([
    db
      .select({ ...batchRow(), sampleCode: samplesTable.sampleCode, strainId: samplesTable.strainId })
      .from(batchesTable)
      .innerJoin(samplesTable, eq(samplesTable.id, batchesTable.sampleId))
      .where(conditions.length > 0 ? and(...conditions) : undefined),
    loadDueDateInputs(),
  ]);

  res.json(
    batches.map((b) => ({
      ...b,
      computedDueDate: computeDueDate(b, b.strainId ? overrideByStrainId.get(b.strainId) : null, globalMonths),
    })),
  );
});

router.get("/batches/:id", async (req, res) => {
  const id = z.coerce.number().parse(req.params.id);
  const [[batch], { overrideByStrainId, globalMonths }] = await Promise.all([
    db
      .select({
        ...batchRow(),
        sampleCode: samplesTable.sampleCode,
        varietyLabel: varietiesTable.label,
        strainLabel: strainsTable.label,
        strainId: samplesTable.strainId,
        sampleArchived: samplesTable.archived,
      })
      .from(batchesTable)
      .innerJoin(samplesTable, eq(samplesTable.id, batchesTable.sampleId))
      .leftJoin(varietiesTable, eq(varietiesTable.id, samplesTable.varietyId))
      .leftJoin(strainsTable, eq(strainsTable.id, samplesTable.strainId))
      .where(eq(batchesTable.id, id)),
    loadDueDateInputs(),
  ]);
  if (!batch) {
    res.status(404).json({ error: "Batch not found" });
    return;
  }
  res.json({
    ...batch,
    computedDueDate: computeDueDate(batch, batch.strainId ? overrideByStrainId.get(batch.strainId) : null, globalMonths),
  });
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

// The whole lineage graph is small at this lab's scale, so it's simplest and
// fastest to load it once per request and walk it in memory rather than
// write recursive SQL.
async function loadLineageGraph() {
  const [allBatches, allLineage] = await Promise.all([
    db.select({ ...batchRow(), sampleCode: samplesTable.sampleCode }).from(batchesTable).innerJoin(samplesTable, eq(samplesTable.id, batchesTable.sampleId)),
    db.select().from(batchLineageTable),
  ]);
  const batchesById = new Map(allBatches.map((b) => [b.id, b]));
  const parentsOf = new Map<number, number[]>();
  const childrenOf = new Map<number, number[]>();
  for (const link of allLineage) {
    parentsOf.set(link.childBatchId, [...(parentsOf.get(link.childBatchId) ?? []), link.parentBatchId]);
    childrenOf.set(link.parentBatchId, [...(childrenOf.get(link.parentBatchId) ?? []), link.childBatchId]);
  }
  return { batchesById, parentsOf, childrenOf };
}

// Ancestors as a single line of descent — this batch, parent, grandparent,
// back to the initiation batch. A pooled batch has more than one immediate
// parent; this follows the first-recorded parent at each step rather than
// branching, since the default view is specified to be a single line. The
// full picture (including the other parent) is in /lineage-tree.
router.get("/batches/:id/ancestors", async (req, res) => {
  const id = z.coerce.number().parse(req.params.id);
  const { batchesById, parentsOf } = await loadLineageGraph();
  if (!batchesById.has(id)) {
    res.status(404).json({ error: "Batch not found" });
    return;
  }

  const chain = [];
  const visited = new Set<number>();
  let currentId: number | undefined = id;
  while (currentId !== undefined && !visited.has(currentId)) {
    visited.add(currentId);
    const batch = batchesById.get(currentId);
    if (!batch) break;
    chain.push(batch);
    currentId = parentsOf.get(currentId)?.[0];
  }
  res.json(chain);
});

// The full tree on demand: every ancestor, every descendant, and siblings
// (other children of this batch's immediate parent(s)).
router.get("/batches/:id/lineage-tree", async (req, res) => {
  const id = z.coerce.number().parse(req.params.id);
  const { batchesById, parentsOf, childrenOf } = await loadLineageGraph();
  if (!batchesById.has(id)) {
    res.status(404).json({ error: "Batch not found" });
    return;
  }

  const ancestorIds = new Set<number>();
  const walkAncestors = (bid: number) => {
    for (const p of parentsOf.get(bid) ?? []) {
      if (!ancestorIds.has(p)) {
        ancestorIds.add(p);
        walkAncestors(p);
      }
    }
  };
  walkAncestors(id);

  const descendantIds = new Set<number>();
  const walkDescendants = (bid: number) => {
    for (const c of childrenOf.get(bid) ?? []) {
      if (!descendantIds.has(c)) {
        descendantIds.add(c);
        walkDescendants(c);
      }
    }
  };
  walkDescendants(id);

  const siblingIds = new Set<number>();
  for (const p of parentsOf.get(id) ?? []) {
    for (const sib of childrenOf.get(p) ?? []) {
      if (sib !== id) siblingIds.add(sib);
    }
  }

  res.json({
    ancestors: [...ancestorIds].map((bid) => batchesById.get(bid)!),
    siblings: [...siblingIds].map((bid) => batchesById.get(bid)!),
    descendants: [...descendantIds].map((bid) => batchesById.get(bid)!),
  });
});

const targetBatchAlias = alias(batchesTable, "target_batch");

// One combined, newest-first timeline of everything that happened to this
// batch: transfers/discards/corrections from container_events, and key
// field edits (including a manual contamination-alert override, which is
// just a change_log row with fieldName="contaminationAlert" and a reason)
// from change_log. Returns structured data; the frontend renders the
// human-readable summary line.
router.get("/batches/:id/timeline", async (req, res) => {
  const id = z.coerce.number().parse(req.params.id);

  const events = await db
    .select({
      id: containerEventsTable.id,
      eventType: containerEventsTable.eventType,
      quantity: containerEventsTable.quantity,
      reason: containerEventsTable.reason,
      note: containerEventsTable.note,
      eventDate: containerEventsTable.eventDate,
      occurredAt: containerEventsTable.createdAt,
      userId: containerEventsTable.createdBy,
      userDisplayName: usersTable.displayName,
      targetBatchId: containerEventsTable.targetBatchId,
      targetSubcode: targetBatchAlias.subcode,
    })
    .from(containerEventsTable)
    .leftJoin(usersTable, eq(usersTable.id, containerEventsTable.createdBy))
    .leftJoin(targetBatchAlias, eq(targetBatchAlias.id, containerEventsTable.targetBatchId))
    .where(and(eq(containerEventsTable.batchId, id), eq(containerEventsTable.voided, false)));

  const changes = await db
    .select({
      id: changeLogTable.id,
      fieldName: changeLogTable.fieldName,
      oldValue: changeLogTable.oldValue,
      newValue: changeLogTable.newValue,
      reason: changeLogTable.reason,
      occurredAt: changeLogTable.changedAt,
      userId: changeLogTable.changedBy,
      userDisplayName: usersTable.displayName,
    })
    .from(changeLogTable)
    .leftJoin(usersTable, eq(usersTable.id, changeLogTable.changedBy))
    .where(and(eq(changeLogTable.recordType, "batch"), eq(changeLogTable.recordId, id)));

  const timeline = [
    ...events.map((e) => ({ kind: "event" as const, ...e })),
    ...changes.map((c) => ({ kind: "field_change" as const, ...c })),
  ].sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime());

  res.json(timeline);
});

const UpdateBatchBody = z.object({
  stage: z.string().min(1).optional(),
  medium: z.string().nullish(),
  containerType: z.string().nullish(),
  location: z.string().min(1).optional(),
  transferDate: z.coerce.date().optional(),
  notes: z.string().nullish(),
  // Explicit null clears the override (falls back to the computed default);
  // omitted leaves it untouched.
  dueDateOverride: z.coerce.date().nullish(),
});

/**
 * Full field editing lives here, not the samples-table Edit view — that's a
 * quick shelf-side tool for vessel counts only. Never touches quantity;
 * that's exclusively discard/correction events (see recordDiscard and the
 * correction route).
 */
router.patch("/batches/:id", async (req, res) => {
  const id = z.coerce.number().parse(req.params.id);
  const body = UpdateBatchBody.parse(req.body);

  const [before] = await db.select().from(batchesTable).where(eq(batchesTable.id, id));
  if (!before) {
    res.status(404).json({ error: "Batch not found" });
    return;
  }
  if (before.voided) {
    res.status(400).json({ error: "Cannot edit a voided batch" });
    return;
  }

  const updates: Partial<typeof batchesTable.$inferInsert> = {};
  if (body.stage !== undefined) updates.stage = body.stage;
  if (body.medium !== undefined) updates.medium = body.medium;
  if (body.containerType !== undefined) updates.containerType = body.containerType;
  if (body.location !== undefined) updates.location = body.location;
  if (body.transferDate !== undefined) updates.transferDate = body.transferDate.toISOString().split("T")[0];
  if (body.notes !== undefined) updates.notes = body.notes;
  if (body.dueDateOverride !== undefined) {
    updates.dueDateOverride = body.dueDateOverride ? body.dueDateOverride.toISOString().split("T")[0] : null;
  }

  const [after] = await db
    .update(batchesTable)
    .set({ ...updates, updatedBy: req.currentUser!.id, updatedAt: new Date() })
    .where(eq(batchesTable.id, id))
    .returning();

  await recordChanges("batch", id, before, after, req.currentUser!.id);

  res.json(after);
});

const SubcultureOutput = z.object({
  consumedQuantity: z.number().int().positive(),
  producedQuantity: z.number().int().positive(),
  stage: z.string().min(1),
  medium: z.string().nullish(),
  containerType: z.string().nullish(),
  location: z.string().min(1),
  notes: z.string().nullish(),
  // Mutually exclusive in the UI: appearedCleanAtTransfer drives the normal
  // inheritance math; isRescue bypasses it entirely (RESCUE_CONTAMINATION_STATE
  // applies regardless of the source's current alert state). If a client sends
  // both, isRescue wins.
  appearedCleanAtTransfer: z.boolean().optional(),
  isRescue: z.boolean().optional(),
});

const SubcultureBody = z.object({
  transferDate: z.coerce.date(),
  outputs: z.array(SubcultureOutput).min(1),
  // The transfer dialog's "close out source" checkbox and the standalone
  // discard action are one mechanism (see recordDiscard) reached from two
  // places. Requiring a reason here mirrors the standalone action's
  // requirement — the remainder must never vanish without an explanation.
  closeOutSource: z.object({ reason: z.string().min(1) }).nullish(),
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
  const remainderAfterOutputs = Number(computedQuantity) - totalConsumed;
  if (body.closeOutSource && remainderAfterOutputs <= 0) {
    res.status(400).json({ error: "There would be nothing left in the source batch to close out" });
    return;
  }

  const transferDateStr = body.transferDate.toISOString().split("T")[0];

  const { children, closedOutEvent } = await db.transaction(async (tx) => {
    const created = [];
    let anyRescue = false;

    for (const output of body.outputs) {
      const contamination = output.isRescue
        ? RESCUE_CONTAMINATION_STATE
        : computeInheritedContamination(source, output.appearedCleanAtTransfer ?? true);
      if (output.isRescue) anyRescue = true;
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

    if (anyRescue) {
      await markHadContamination(tx, source.id, req.currentUser!.id);
    }

    let closedOutEvent = null;
    if (body.closeOutSource) {
      closedOutEvent = await recordDiscard(tx, {
        batchId: source.id,
        quantity: remainderAfterOutputs,
        reason: body.closeOutSource.reason,
        eventDate: transferDateStr,
        userId: req.currentUser!.id,
      });
    }

    return { children: created, closedOutEvent };
  });

  res.status(201).json({ source: { id: source.id }, children, closedOutEvent });
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

  const event = await recordDiscard(db, {
    batchId: id,
    quantity: body.quantity,
    reason: body.reason,
    eventDate: body.eventDate.toISOString().split("T")[0],
    note: body.note,
    userId: req.currentUser!.id,
  });

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
