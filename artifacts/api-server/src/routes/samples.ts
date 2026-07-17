import { Router } from "express";
import { db, samplesTable, transfersTable } from "@workspace/db";
import { eq, ilike, or, and, desc } from "drizzle-orm";
import {
  CreateSampleBody,
  UpdateSampleBody,
  ListSamplesQueryParams,
  GetSampleParams,
  UpdateSampleParams,
  DeleteSampleParams,
  GetSampleTransfersParams,
  SubcultureSampleParams,
  SubcultureSampleBody,
} from "@workspace/api-zod";
import { sql } from "drizzle-orm";

const router = Router();

/** Convert a coerced Date (from zod) to the YYYY-MM-DD string drizzle's pg `date` columns expect. */
function toDateString(value: Date): string {
  return value.toISOString().split("T")[0];
}

function toDateStringOrNull(value: Date | null | undefined): string | null | undefined {
  if (value === null || value === undefined) return value;
  return toDateString(value);
}

router.get("/samples", async (req, res) => {
  const query = ListSamplesQueryParams.parse(req.query);
  const conditions = [];

  if (query.status) conditions.push(eq(samplesTable.status, query.status));
  if (query.stage) conditions.push(eq(samplesTable.stage, query.stage));
  if (query.parentSampleId !== undefined)
    conditions.push(eq(samplesTable.parentSampleId, query.parentSampleId));
  if (query.search) {
    conditions.push(
      or(
        ilike(samplesTable.sampleCode, `%${query.search}%`),
        ilike(samplesTable.cultivar, `%${query.search}%`),
        ilike(samplesTable.location, `%${query.search}%`),
      ),
    );
  }

  const samples =
    conditions.length > 0
      ? await db.select().from(samplesTable).where(and(...conditions))
      : await db.select().from(samplesTable);

  res.json(samples);
});

router.post("/samples", async (req, res) => {
  const body = CreateSampleBody.parse(req.body);
  const [sample] = await db
    .insert(samplesTable)
    .values({
      ...body,
      dateInitiated: toDateString(body.dateInitiated),
      nextActionDate: toDateStringOrNull(body.nextActionDate),
      updatedAt: new Date(),
    })
    .returning();
  res.status(201).json(sample);
});

router.get("/samples/:id", async (req, res) => {
  const { id } = GetSampleParams.parse(req.params);
  const [sample] = await db
    .select()
    .from(samplesTable)
    .where(eq(samplesTable.id, id));
  if (!sample) {
    res.status(404).json({ error: "Sample not found" });
    return;
  }
  res.json(sample);
});

router.patch("/samples/:id", async (req, res) => {
  const { id } = UpdateSampleParams.parse(req.params);
  const body = UpdateSampleBody.parse(req.body);
  const [sample] = await db
    .update(samplesTable)
    .set({
      ...body,
      dateInitiated: body.dateInitiated ? toDateString(body.dateInitiated) : undefined,
      nextActionDate: toDateStringOrNull(body.nextActionDate),
      updatedAt: new Date(),
    })
    .where(eq(samplesTable.id, id))
    .returning();
  if (!sample) {
    res.status(404).json({ error: "Sample not found" });
    return;
  }
  res.json(sample);
});

router.delete("/samples/:id", async (req, res) => {
  const { id } = DeleteSampleParams.parse(req.params);

  // Collect all descendant sample IDs (recursive subcultures) using a CTE
  const descendants = await db.execute(sql`
    WITH RECURSIVE tree AS (
      SELECT id FROM samples WHERE id = ${id}
      UNION ALL
      SELECT s.id FROM samples s INNER JOIN tree t ON s.parent_sample_id = t.id
    )
    SELECT id FROM tree
  `);
  const allIds: number[] = descendants.rows.map((r: Record<string, unknown>) => Number(r.id));

  if (allIds.length > 0) {
    // Delete transfers referencing any of these samples
    await db.execute(sql`
      DELETE FROM transfers
      WHERE from_sample_id = ANY(${sql`ARRAY[${sql.join(allIds.map(i => sql`${i}`), sql`, `)}]::int[]`})
         OR to_sample_id   = ANY(${sql`ARRAY[${sql.join(allIds.map(i => sql`${i}`), sql`, `)}]::int[]`})
    `);
    // Delete all descendant samples (deepest first via reverse order)
    await db.execute(sql`
      WITH RECURSIVE tree AS (
        SELECT id, parent_sample_id FROM samples WHERE id = ${id}
        UNION ALL
        SELECT s.id, s.parent_sample_id FROM samples s INNER JOIN tree t ON s.parent_sample_id = t.id
      )
      DELETE FROM samples WHERE id IN (SELECT id FROM tree)
    `);
  }

  res.status(204).send();
});

router.post("/samples/discard-contaminated", async (req, res) => {
  const result = await db
    .update(samplesTable)
    .set({ status: "discarded", updatedAt: new Date() })
    .where(eq(samplesTable.status, "contaminated"));
  const discarded = result.rowCount ?? 0;
  res.json({ discarded });
});

/** Map stage name → single-letter code for sub-batch naming */
function stageToLetter(stage: string): string {
  switch (stage.toLowerCase()) {
    case "initiation": return "i";
    case "multiplication": return "m";
    case "rooting":
    case "acclimatization":
    case "revitalization": return "r";
    case "long-term storage": return "s";
    default: return "x";
  }
}

/** Extract root code — strips trailing -letter[digits] sub-code if present */
function getRootCode(sampleCode: string): string {
  const match = sampleCode.match(/^(.+?)[-_][a-zA-Z]\d*$/);
  return match ? match[1] : sampleCode;
}

router.post("/samples/:id/subculture", async (req, res) => {
  const { id } = SubcultureSampleParams.parse(req.params);
  const body = SubcultureSampleBody.parse(req.body);

  const [parent] = await db
    .select()
    .from(samplesTable)
    .where(eq(samplesTable.id, id));

  if (!parent) {
    res.status(404).json({ error: "Sample not found" });
    return;
  }

  // Find all existing samples sharing the same root code to avoid sub-code collisions
  const rootCode = getRootCode(parent.sampleCode);
  const existingSiblings = await db
    .select({ sampleCode: samplesTable.sampleCode })
    .from(samplesTable)
    .where(ilike(samplesTable.sampleCode, `${rootCode}-%`));

  // Build a map: stage letter → highest sequence number already used
  const usedSeq: Record<string, number> = {};
  for (const { sampleCode } of existingSiblings) {
    const subMatch = sampleCode.match(/[-_]([a-zA-Z])(\d+)?$/);
    if (subMatch) {
      const letter = subMatch[1].toLowerCase();
      const num = subMatch[2] ? parseInt(subMatch[2], 10) : 1;
      usedSeq[letter] = Math.max(usedSeq[letter] ?? 0, num);
    }
  }

  const children = [];

  for (let i = 0; i < body.outputs.length; i++) {
    const output = body.outputs[i];
    const letter = stageToLetter(output.stage);
    const seq = (usedSeq[letter] ?? 0) + 1;
    usedSeq[letter] = seq;                         // increment for next output of same stage
    const childCode = `${rootCode}-${letter}${seq}`;

    const [child] = await db
      .insert(samplesTable)
      .values({
        sampleCode: childCode,
        cultivar: parent.cultivar,
        stage: output.stage,
        mediaType: output.mediaType ?? parent.mediaType ?? undefined,
        containerType: output.containerType ?? undefined,
        quantity: output.quantity,
        location: output.location,
        status: "active",
        notes: output.notes ?? undefined,
        dateInitiated: typeof body.transferDate === "string"
          ? body.transferDate
          : body.transferDate.toISOString().split("T")[0],
        parentSampleId: id,
        updatedAt: new Date(),
      })
      .returning();

    children.push(child);

    await db.insert(transfersTable).values({
      fromSampleId: id,
      toSampleId: child.id,
      transferDate: typeof body.transferDate === "string"
        ? body.transferDate
        : body.transferDate.toISOString().split("T")[0],
      fromLocation: parent.location,
      toLocation: output.location,
      mediaType: output.mediaType ?? parent.mediaType ?? null,
      quantityTransferred: output.quantity,
      technician: body.technician,
      notes: body.notes ?? null,
    });
  }

  const [updatedParent] = await db
    .update(samplesTable)
    .set({ updatedAt: new Date() })
    .where(eq(samplesTable.id, id))
    .returning();

  res.status(201).json({ parent: updatedParent, children });
});

router.get("/samples/:id/transfers", async (req, res) => {
  const { id } = GetSampleTransfersParams.parse(req.params);

  const fromAlias = db
    .select({ id: samplesTable.id, sampleCode: samplesTable.sampleCode })
    .from(samplesTable)
    .as("from_sample");

  const toAlias = db
    .select({ id: samplesTable.id, sampleCode: samplesTable.sampleCode })
    .from(samplesTable)
    .as("to_sample");

  const transfers = await db
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
        eq(transfersTable.fromSampleId, id),
        eq(transfersTable.toSampleId, id),
      ),
    )
    .orderBy(desc(transfersTable.createdAt));

  res.json(transfers);
});

export default router;
