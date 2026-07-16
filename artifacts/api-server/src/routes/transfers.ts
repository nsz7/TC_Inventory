import { Router } from "express";
import { db, transfersTable, samplesTable } from "@workspace/db";
import { eq, or, desc } from "drizzle-orm";
import {
  CreateTransferBody,
  ListTransfersQueryParams,
  GetTransferParams,
} from "@workspace/api-zod";

const router = Router();

router.get("/transfers", async (req, res) => {
  const query = ListTransfersQueryParams.parse(req.query);

  const fromAlias = db
    .select({ id: samplesTable.id, sampleCode: samplesTable.sampleCode })
    .from(samplesTable)
    .as("from_sample");

  const toAlias = db
    .select({ id: samplesTable.id, sampleCode: samplesTable.sampleCode })
    .from(samplesTable)
    .as("to_sample");

  let rows;
  if (query.sampleId) {
    rows = await db
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
      .where(
        or(
          eq(transfersTable.fromSampleId, query.sampleId),
          eq(transfersTable.toSampleId, query.sampleId),
        ),
      )
      .orderBy(desc(transfersTable.createdAt));
  } else {
    rows = await db
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
        notes: transfersTable.technician,
        createdAt: transfersTable.createdAt,
      })
      .from(transfersTable)
      .leftJoin(fromAlias, eq(transfersTable.fromSampleId, fromAlias.id))
      .leftJoin(toAlias, eq(transfersTable.toSampleId, toAlias.id))
      .orderBy(desc(transfersTable.createdAt));
  }

  res.json(rows);
});

router.post("/transfers", async (req, res) => {
  const body = CreateTransferBody.parse(req.body);
  const [transfer] = await db
    .insert(transfersTable)
    .values(body)
    .returning();

  const fromAlias = db
    .select({ id: samplesTable.id, sampleCode: samplesTable.sampleCode })
    .from(samplesTable)
    .as("from_sample");

  const toAlias = db
    .select({ id: samplesTable.id, sampleCode: samplesTable.sampleCode })
    .from(samplesTable)
    .as("to_sample");

  const [enriched] = await db
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
    .where(eq(transfersTable.id, transfer.id));

  res.status(201).json(enriched);
});

router.get("/transfers/:id", async (req, res) => {
  const { id } = GetTransferParams.parse(req.params);

  const fromAlias = db
    .select({ id: samplesTable.id, sampleCode: samplesTable.sampleCode })
    .from(samplesTable)
    .as("from_sample");

  const toAlias = db
    .select({ id: samplesTable.id, sampleCode: samplesTable.sampleCode })
    .from(samplesTable)
    .as("to_sample");

  const [transfer] = await db
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
    .where(eq(transfersTable.id, id));

  if (!transfer) {
    res.status(404).json({ error: "Transfer not found" });
    return;
  }
  res.json(transfer);
});

export default router;
